# PR Discussion: Prevent effect_update_depth_exceeded when using bind:value on a select with deriveds state in legacy components

**PR #16165**: https://github.com/sveltejs/svelte/pull/16165

## Original PR Description by @raythurnvoid

### The bug

In legacy mode Svelte generates extra code for every `<select bind:value={…}>`. That helper reads the bound value and immediately calls `invalidate_inner_signals`, which writes back to the signals it just read so that indirect updates propagate.

When the bound value itself is produced by a reactive statement (`$:`) this write-back creates a tight loop:

```svelte
<script>
	const default_details = { country: '' };

	$: data    = { locked: false, details: null };
	$: details = data.details ?? default_details;   // reactive

	// variant that fails the same way
	/* let details;
	   $:{ details = data.details ?? default_details } */
</script>

<select bind:value={details.country} disabled={data.locked}>
	<option value="1">1</option>
</select>
```

1. Helper reads `details.country`
2. `invalidate_inner_signals` does `internal_set(data, data)`
3. `$:` re-runs, re-assigns `details`
4. Helper fires again → **infinite loop** → runtime throws `effect_update_depth_exceeded`.

### What this PR does

**Stops emitting the helper when it's not needed.**

In `setup_select_synchronization` we now check the bound identifier:

```javascript
// skip helper if the variable is already managed by a `$:` block
if (bound.type === "Identifier") {
	const binding = context.state.scope.get(bound.name);

	// 1. declared directly inside `$:`
	if (binding?.kind === "legacy_reactive") return;

	// 2. declared elsewhere but *assigned* inside any `$:` block
	for (const [, rs] of context.state.analysis.reactive_statements) {
		if (rs.assignments.has(binding)) return;
	}
}
```

If either condition is true the synchronisation helper is omitted, breaking the cycle. For all other bindings (plain state, props, store-subs, etc.) the helper is still generated, so existing behaviour should be unchanged.

## Discussion

### @7nik Comment

> I wonder why invalidate_inner_signals is placed in a separate effect instead of calling it inside the selector's setter, similarly to how it was done in Svelte 4:
>
> ```javascript
> function select_change_handler() {
> 	details.country = select_value(this);
> 	$$invalidate(0, details), $$invalidate(1, data);
> }
> ```

### @raythurnvoid Response

> Mmh interesting, I can try to change my solution to do that and see if it works ^^. So to mimic the svelte 4 behavior we should call it inside the mutate callback of the value binding right?

### @7nik Follow-up

> setup_select_synchronization is such, basically, since the very beginning of Svelte 5 and I'm not sure why. But I'd explore moving the logic inside the setter in hope we can recreate the Svelte 4 behavior.

### @Rich-Harris Final Comment

> Thank you! I think @7nik is right — the issue here is that we're using effects _at all_ for this. I worry that tweaking the logic will fix the test case but still be buggy. Opened #16200 to start looking into this

## Related Issues/PRs

- **Fixes**: [Issue #13768](https://github.com/sveltejs/svelte/issues/13768) - Broken page with Svelte 5: uncaught effect_update_depth_exceeded
- **Related PR**: [#16200](https://github.com/sveltejs/svelte/pull/16200) - fix: update indirectly-affected bindings on mutation

## Key Insights

1. The root cause is that `invalidate_inner_signals` is called in a separate effect, which creates infinite loops when bound values are produced by reactive statements.

2. Svelte 4 handled this by calling invalidation directly inside the setter, not in a separate effect.

3. The proposed fix in this PR checks if the bound variable is managed by a `$:` block and skips the helper generation in those cases.

4. However, maintainers suggest the real solution is to move away from using effects for this synchronization altogether, similar to how Svelte 4 worked.

## Status

This PR appears to be superseded by PR #16200, which takes a different approach to fix the underlying issue by not using effects for select synchronization.
