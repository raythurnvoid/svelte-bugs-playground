# PR Discussion: fix: update indirectly-affected bindings on mutation

**PR #16200**: https://github.com/sveltejs/svelte/pull/16200

## Status: Draft

## Original PR Description by @Rich-Harris

WIP alternative to [#16165](https://github.com/sveltejs/svelte/pull/16165). The real fix, I think, is to not use effects for synchronization at all, but rather to invalidate indirect bindings on mutation. In other words in a case like this...

```svelte
<script>
  export let selected;
  export let tasks;
</script>

<select bind:value={selected}>
  {#each tasks as task}
    <option value='{task}'>{task.description}</option>
  {/each}
</select>

<label>
  <input type='checkbox' bind:checked={selected.done}> {selected.description}
</label>

<h2>Pending tasks</h2>
{#each tasks.filter(t => !t.done) as task}
  <p>{task.description}</p>
{/each}
```

...updating `selected` should also update `tasks`, because the bindings are linked. I think we might be able to use this mechanism for each blocks as well and end up with simpler compiler code, though I don't have time to finish it right now and my brain needs a rest anyway because this stuff is confusing as hell. Can't wait to be able to delete all this legacy gubbins.

## Key Approach

### Problem with Current Approach (Effects-based)

- Current Svelte 5 uses effects for select synchronization
- This creates infinite loops when bound values are produced by reactive statements (`$:`)
- The effect reads bound value → calls `invalidate_inner_signals` → triggers reactive statement → effect runs again

### Proposed Solution (Mutation-based)

- Instead of using effects for synchronization, invalidate indirect bindings directly on mutation
- When `selected` is updated, also update `tasks` because the bindings are linked
- This approach could potentially be extended to `{#each}` blocks as well
- Would result in simpler compiler code overall

## Related Issues/PRs

- **Alternative to**: [PR #16165](https://github.com/sveltejs/svelte/pull/16165) - Prevent effect_update_depth_exceeded when using bind:value on a select with deriveds state in legacy components
- **Addresses**: [Issue #13768](https://github.com/sveltejs/svelte/issues/13768) - Broken page with Svelte 5: uncaught effect_update_depth_exceeded

## Key Insights

1. **Root Cause**: The fundamental issue is using effects for binding synchronization in Svelte 5, which differs from Svelte 4's approach.

2. **Svelte 4 vs Svelte 5**:

   - Svelte 4: Direct invalidation in setters
   - Svelte 5: Effects-based synchronization (problematic)

3. **Proposed Fix**: Move back to a mutation-based approach where indirect bindings are invalidated when related bindings change.

4. **Broader Impact**: This approach could simplify compiler code and potentially be applied to other areas like `{#each}` blocks.

5. **Long-term Goal**: Rich mentions wanting to "delete all this legacy gubbins" - indicating this is part of the broader legacy mode maintenance burden.

## Technical Details

The PR appears to implement a mechanism where:

- When a bound value is mutated, the compiler identifies other bindings that might be indirectly affected
- Those indirect bindings are invalidated immediately as part of the mutation
- This eliminates the need for separate effects to handle synchronization

## Status and Next Steps

- This is a **Draft PR** and work-in-progress
- Rich Harris noted needing time to complete the implementation
- The approach seems promising but requires more development
- Could potentially replace the more targeted fix from PR #16165

## Community Response

- Received positive reaction (👍 from gterras)
- No changeset added yet (bot comment indicates this)
- Preview build available for testing
