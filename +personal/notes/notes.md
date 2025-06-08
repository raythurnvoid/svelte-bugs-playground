# Svelte Issue #16090 Investigation

**Issue**: [Derived value not receiving updates](https://github.com/sveltejs/svelte/issues/16090)

## Problem Summary

When a value twice derived is used in a computed expression which is the value of a prop/argument of a component/snippet with a default value, it may not always receive updates when the underlying state changes.

- **Broken in**: Svelte 5.19.5+
- **Working in**: Svelte 5.19.4 and below
- **Root cause**: PR #15137 introduced this regression

## 🔍 **ROOT CAUSE IDENTIFIED - Fallback Value Compilation Issue**

### The Real Issue: Fallback Value Affects skip_reaction

The bug occurs because when a snippet has a fallback/default value, the compiler generates different code that sets `skip_reaction = true` during dependency checking, leading to incorrect status marking of derived values.

#### **Compiled Code with Fallback Value (BROKEN)**

```javascript
{#snippet dummy(value = 0)}{/snippet}
```

Compiles to:

```javascript
const dummy = $.wrap_snippet(_page, function ($$anchor, $$arg0) {
	$.validate_snippet_args(...arguments);

	let value = $.derived_safe_equal(() => $.fallback($$arg0?.(), 0));

	$.get(value);
});
```

#### **The Problem Flow**

1. When `$.fallback()` is called, **`skip_reaction` is already `true`**
2. The `$.get(value)` operation reads dependencies recursively
3. When it reaches `derived1`, the value doesn't change (data.value is still 0), so `wv` is not increased
4. Because `skip_reaction = true`, in `update_derived()`, the status is set to `MAYBE_DIRTY`:
   ```javascript
   var status =
   	(skip_reaction || (derived.f & UNOWNED) !== 0) && derived.deps !== null
   		? MAYBE_DIRTY
   		: CLEAN;
   ```
5. `check_dirtiness(derived1)` returns `true` because status is `MAYBE_DIRTY`
6. In `check_dirtiness(derived2)`, after the dependency loop:

   ```javascript
   // BREAKPOINT
   for (i = 0; i < length; i++) {
   	dependency = dependencies[i];

   	if (check_dirtiness(/** @type {Derived} */ (dependency))) {
   		update_derived(/** @type {Derived} */ (dependency));
   	}

   	if (dependency.wv > reaction.wv) {
   		// BREAKPOINT
   		return true;
   	}
   }

   // Unowned signals should never be marked as clean unless they
   // are used within an active_effect without skip_reaction
   if (!is_unowned || (active_effect !== null && !skip_reaction)) {
   	// BREAKPOINT
   	set_signal_status(reaction, CLEAN);
   }
   ```

7. **Result**: `derived1` ends up `MAYBE_DIRTY` and `derived2` ends up `CLEAN` - which is incorrect!

#### **Why This Breaks Future Updates**

The core issue is that **`derived1` MUST be set to `CLEAN`** for the system to work correctly. Here's why:

When `override` is later changed (e.g., `override = 1`), the system checks:

```javascript
// If the signal a) was previously clean or b) is an unowned derived, then mark it
if ((flags & (CLEAN | UNOWNED)) !== 0) {
	if ((flags & DERIVED) !== 0) {
		mark_reactions(/** @type {Derived} */ (reaction), MAYBE_DIRTY);
	} else {
		schedule_effect(/** @type {Effect} */ (reaction));
	}
}
```

**What should happen**: If `derived1` is `CLEAN`, it enters this condition and properly marks its reactions as `MAYBE_DIRTY`, allowing the change to propagate.

**What actually happens**: Since `derived1` is stuck at `MAYBE_DIRTY`, it doesn't enter this condition, so the change doesn't propagate to dependent reactions like `derived2`.

**The cascade failure**:

1. `derived1` stays `MAYBE_DIRTY` (should be `CLEAN`)
2. When `override` changes, `derived1` doesn't enter the propagation logic
3. `derived2` never gets notified of the change
4. UI doesn't update

#### **Without Fallback Value (CORRECT BEHAVIOR)**

```javascript
{#snippet dummy(value)}{/snippet}
```

- No fallback compilation, `skip_reaction` remains `false`
- Derived values get marked correctly

## Current Investigation State

### Test Code Being Debugged

```typescript
<script lang="ts">
	import { flushSync, tick } from "svelte";

	let show = $state(true);
	let data = $state({ value: 0 });
	let override: number | null = $state(null);

	let derived1 = $derived(override ?? data.value);
	let derived2 = $derived(derived1);

	$effect(() => {
		(async () => {
			// override = 3;  // ⬅️ THIS LINE affects write version sequence
			show = false;
			data = { value: 0 };
			await tick();
			show = true;
			await tick();
			override = 1;
			await tick();
			override = 2;
		})();
	});
</script>

{#snippet dummy(value = 0)}{/snippet}  <!-- Fallback value causes the bug -->

{#if show}
	{derived2}
	{@render dummy(derived2 ? 0 : 0)}
{/if}
```

### Investigation Focus

1. ✅ **SOLVED**: How fallback value compilation affects `skip_reaction` and derived status
2. 🔄 **CURRENT**: Find where `$.fallback()` is compiled and how it influences `skip_reaction`
3. ⏭️ Explore potential fixes in either the compiler or the runtime to prevent incorrect status marking

### Technical Deep Dive

- **Root Issue**: Snippet fallback value compilation generates code that leads to `skip_reaction = true` during dependency resolution
- `$.fallback()` function - Need to find where this is generated during compilation
- Snippet compilation code - Generates the problematic fallback logic

### Debugging Context

- ✅ Fallback value compilation identified as root cause
- ✅ Detailed flow of incorrect status marking understood
- ✅ Both breakpoints and status transitions mapped
- 🔄 Currently investigating the Svelte compiler to find the source of `$.fallback()`
- ⏭️ Explore and test alternative fixes that don't introduce regressions

---

_Last updated: Current debugging session_
_Status: Root cause identified. Previous fix caused regressions._
_Next: Re-evaluate and find a robust solution._
