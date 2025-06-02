# Comprehensive Svelte Mount vs Template Rendering Bug Analysis

## Executive Summary for PR

**Issue:** First `{#if}` block fails to update in programmatically mounted components using `mount()` API  
**Affected:** Svelte 5 runes mode with context passing and reactive state  
**Root Cause:** Proxy properties created with `state()` get added to `reaction_sources`, breaking dependency registration  
**Fix Location:** `svelte/src/internal/client/proxy.js` - use `source()` instead of `state()` for proxy properties  
**Test Added:** `packages/svelte/tests/runtime-runes/samples/mount-component-in-onmount-with-context-with-state/`

### Quick Reproduction

```svelte
<!-- Works in template, fails when mounted via mount() API -->
{#if stateFromContext.value === true}
	<span>First block - gets stuck</span>
{/if}
{#if stateFromContext.value === true}
	<span>Second block - works fine</span>
{/if}
```

**Key insight:** Only the first conditional block fails; subsequent ones work correctly.

## Bug Overview

Programmatically mounted components using `mount()` exhibit fundamentally different conditional rendering behavior compared to template-rendered components, specifically affecting `{#if}` block lifecycle management and dependency registration.

The bug manifests when components are mounted via the `mount()` API with context-passed state objects - the first conditional block in the mounted component fails to update when the state changes, while subsequent conditional blocks work correctly.

This issue is specific to **Svelte 5 runes mode** where proxy objects are used for state management.

## Root Cause Summary

The problem occurs because proxy property signals are inappropriately added to `reaction_sources` during creation, causing the first `{#if}` block to fail dependency registration in the `get()` function.

## The Actual Fix

### Location and Understanding

**File:** `svelte/src/internal/client/proxy.js`  
**Change:** Use `source()` instead of `state()` for proxy property creation

### Understanding the Import Change

The key to understanding this fix is the import change:

**Before (problematic):**

```javascript
import { state as source, set } from './reactivity/sources.js';
// When code called source(), it was actually calling state()
```

**After (fixed):**

```javascript
import { source, state, set } from './reactivity/sources.js';
// Now source() calls the actual source() function
```

### The Critical Change

The most important change is in the proxy's `get` trap where property signals are created:

**Before (buggy):**

```javascript
// This was actually calling state() due to the import alias
s = with_parent(() => source(proxy(exists ? target[prop] : UNINITIALIZED), stack));
```

**After (fixed):**

```javascript
// Now this calls the actual source() function, avoiding push_reaction_value()
s = with_parent(() => source(proxy(exists ? target[prop] : UNINITIALIZED), stack));
```

The fix ensures that when proxy properties are accessed (like `stateObjectFromContext.showText`), the created signals use `source()` instead of `state()`, preventing them from being added to `reaction_sources` during creation.

## Previous Fix Attempts

### The `!is_derived` Approach (Attempted but Rejected)

An initial fix attempt was made in `runtime.js` to modify the dependency registration check:

```javascript
// ATTEMPTED FIX (rejected):
if (!is_derived || !reaction_sources?.includes(signal)) {
	// Register dependency
}
```

**Why it was rejected:** This approach broke the `untrack-own-deriveds` test by allowing derived signals created within reactions to register as dependencies, defeating the circular dependency prevention that the original commit was meant to implement.

**The conflicting test case:**

```javascript
class Foo {
	value = $state(0);
	double = $derived(this.value * 2); // ← Created within constructor

	constructor() {
		console.log(this.value, this.double); // ← Should NOT create dependency
	}
}

$effect(() => {
	foo = new Foo(); // ← Constructor runs within effect
});
```

The test expects `[0, 0]` in console logs, meaning the derived `double` should NOT depend on itself during construction.

### Why the Proxy Fix Is Better

The issue isn't with the `reaction_sources` check in `get()` - that check is working correctly to prevent circular dependencies. The real issue was that **proxy property signals shouldn't be in `reaction_sources` in the first place**.

By using `source()` instead of `state()` for proxy properties:

1. ✅ Prevents proxy signals from being added to `reaction_sources`
2. ✅ Allows proper dependency registration for all access patterns
3. ✅ Maintains circular dependency prevention for derived signals
4. ✅ Keeps all existing tests passing

### Why This Fix Works

**Template Mode:** Sources created normally, `reaction_sources` stays `null`, dependency registration works

**Mount Mode:** With `source()` used in proxy:

- Proxy signals NOT added to `reaction_sources` during creation
- `reaction_sources` stays `null` or contains only derived signals
- First `{#if}` block access: `!reaction_sources?.includes(signal)` returns `true`
- Dependency registration succeeds
- Both if-blocks work properly

## Test Implementation

### Created Test: `mount-component-in-onmount-with-context-with-state`

**Location:** `svelte/packages/svelte/tests/runtime-runes/samples/mount-component-in-onmount-with-context-with-state/`

**Purpose:** Reproduces the exact bug scenario where the first `{#if}` block fails to update when state changes in programmatically mounted components.

#### Working Test Structure

**`main.svelte`:**

```svelte
<script>
	import { onMount } from 'svelte';
	import { mountComponentWithContext } from './module.svelte.js';

	let mountTarget;
	let getShowText;
	let setShowText;

	onMount(() => {
		const r = mountComponentWithContext(mountTarget);
		getShowText = r.getShowText;
		setShowText = r.setShowText;
	});

	function toggleState() {
		setShowText(!getShowText());
	}
</script>

<button onclick={() => toggleState()}>toggle</button><div bind:this={mountTarget}></div>
```

**`module.svelte.ts`:**

```typescript
import { mount } from 'svelte';
import Nested from './nested.svelte';

export function mountComponentWithContext(target: any) {
	const stateObject = $state({ showText: true });

	mount(Nested, {
		target,
		props: {},
		context: new Map([['stateContext', stateObject]])
	});

	return {
		getShowText: () => stateObject.showText,
		setShowText: (newShowText: any) => {
			stateObject.showText = newShowText;
		}
	};
}
```

**`nested.svelte`:**

```svelte
<script>
	import { getContext } from 'svelte';
	const stateObjectFromContext = getContext('stateContext');
</script>

<p>First if block:</p>
{#if stateObjectFromContext.showText === true}
	<span class="first">First: {stateObjectFromContext.showText}</span>
{/if}

<p>Second if block:</p>
{#if stateObjectFromContext.showText === true}
	<span class="second">Second: {stateObjectFromContext.showText}</span>
{/if}
```

**`_config.js`:**

```javascript
import { flushSync } from 'svelte';
import { test } from '../../test';

export default test({
	test({ assert, target, logs }) {
		const button = target.querySelector('button');

		// Initial state: both if blocks visible
		assert.htmlEqual(
			target.innerHTML,
			`
			<button>toggle</button>
			<div>
				<p>First if block:</p>
				<span class="first">First: true</span>
				<p>Second if block:</p>
				<span class="second">Second: true</span>
			</div>
		`
		);

		// Toggle state to false
		flushSync(() => button?.click());

		// CRITICAL TEST: Both if blocks should disappear
		// In buggy version, first block would remain visible
		assert.htmlEqual(
			target.innerHTML,
			`
			<button>toggle</button>
			<div>
				<p>First if block:</p>
				<p>Second if block:</p>
			</div>
		`
		);
	}
});
```

#### Key Implementation Insights

1. **Button Click Handler Fix:** Using `onclick={() => toggleState()}` instead of `onclick={toggleState}` ensures proper reactive context binding
2. **Modular Architecture:** Extracting mount logic to `module.svelte.ts` provides clean state access methods
3. **Focused Testing:** Test concentrates on the core bug - both if-blocks should behave identically

#### Test Behavior

**Before Fix (Buggy):**

1. ✅ Initial: Both blocks show "First: true" and "Second: true"
2. ❌ Toggle to false: First block remains visible, second block disappears
3. ❌ State inconsistency: First if-block fails to react to state changes

**After Fix (Correct):**

1. ✅ Initial: Both blocks show "First: true" and "Second: true"
2. ✅ Toggle to false: Both blocks disappear completely
3. ✅ Consistent behavior: Both if-blocks react identically to state changes

This test verifies that programmatically mounted components with context exhibit the same conditional rendering behavior as template-rendered components.

## Critical Code Path Analysis

### Exact Code That Fails to Execute

The bug occurs because specific critical code sections don't execute when `!reaction_sources?.includes(signal)` returns `false`. Here's the exact failure chain:

#### 1. Skipped Dependency Registration in `get()` (runtime.js:948-964)

When the first if-block tries to access the state source, this entire code block gets skipped:

```javascript
// runtime.js:948-964 - THIS BLOCK GETS SKIPPED
if (!reaction_sources?.includes(signal)) {
	var reaction = active_reaction;

	if (reaction !== null) {
		if (dependency !== null && dependency.reactions !== null) {
			remove_reaction(dependency, reaction);
		}

		add_reaction(signal, reaction);

		if (current_dependencies === null) {
			current_dependencies = [signal];
		} else {
			current_dependencies.push(signal);
		}
	}

	update_derived_version(signal);
}
```

**Critical consequence:** The `add_reaction(signal, reaction)` call never happens, so the first if-block effect never gets registered as a dependency.

#### 2. Missing Effect in `add_reaction()` (runtime.js:455-475)

This is the exact function that should run but doesn't:

```javascript
// runtime.js:455-475 - SHOULD EXECUTE BUT DOESN'T
export function add_reaction(signal, reaction) {
	var reactions = signal.reactions;

	if (reactions === null) {
		signal.reactions = [reaction];
	} else if (reactions.includes(reaction)) {
		// Exists already
	} else {
		reactions.push(reaction); // ← THIS LINE SHOULD ADD THE IF-BLOCK EFFECT
	}

	var deps = reaction.deps;

	if (deps === null) {
		reaction.deps = [signal];
	} else {
		deps.push(signal);
	}
}
```

**Critical line:** `reactions.push(reaction)` should add the first if-block effect to the signal's reactions array but never executes.

#### 3. Missing Effect in `mark_reactions()` (sources.js:253-285)

Later, when the state changes, this function executes but can't find the first if-block effect:

```javascript
// sources.js:253-285 - EXECUTES BUT MISSING REACTION
function mark_reactions(signal, to_status, exclude_derived) {
	var reactions = signal.reactions;
	if (reactions !== null) {
		var runes = is_runes();
		var length = reactions.length;

		for (var i = 0; i < length; i++) {
			var reaction = reactions[i];
			var flags = reaction.f;

			// ← FIRST IF-BLOCK EFFECT IS MISSING FROM THIS ARRAY!
			// Only the second if-block effect and other effects are here

			if (!exclude_derived || (flags & DERIVED) === 0) {
				set_signal_status(reaction, to_status);
			}
		}
	}
}
```

**Critical missing element:** The first if-block effect is completely absent from `reactions[i]` iteration, so it never gets marked as dirty.

### Complete Failure Sequence

Here's the exact sequence of what goes wrong:

1. **Mount Context Creation**: State source created within mount effect context
2. **reaction_sources Population**: Source gets added to `reaction_sources` array during creation
3. **First If-Block Access**: First `{#if}` block tries to read the state
4. **Failed Check**: `!reaction_sources?.includes(signal)` returns `false` (signal IS in array)
5. **Skipped Registration**: Lines 948-964 in `get()` don't execute
6. **Missing add_reaction**: Effect never gets added to signal's reactions array
7. **State Change**: Later state change triggers `mark_reactions()`
8. **Missing Effect**: First if-block effect not in reactions array, doesn't get marked dirty
9. **No Update**: First if-block never re-renders

### What Should Happen vs What Actually Happens

**Template Mode (Working):**

```
State creation (reaction_sources=null)
→ First if access
→ !reaction_sources?.includes(signal) = true
→ add_reaction() executes
→ Effect added to reactions
→ State change
→ Effect marked dirty
→ If-block updates
```

**Mount Mode (Broken):**

```
State creation (reaction_sources=[signal])
→ First if access
→ !reaction_sources?.includes(signal) = false
→ add_reaction() SKIPPED
→ Effect missing from reactions
→ State change
→ Effect not marked dirty
→ If-block stuck
```

### The Critical Lines

These are the exact lines that determine the bug:

- **Failure point:** `runtime.js:948` - `if (!reaction_sources?.includes(signal))`
- **Missing execution:** `runtime.js:952` - `add_reaction(signal, reaction)`
- **Missing effect:** `runtime.js:463` - `reactions.push(reaction)`
- **Missing notification:** `sources.js:269` - `set_signal_status(reaction, to_status)`

This chain analysis shows exactly why mount mode fails while template mode works - it's a precise dependency registration failure at the signal level.

## Understanding Svelte's Reactivity System

### Sources (Signals)

A **Source** is Svelte's fundamental reactive primitive - essentially a container for a value that can notify dependents when it changes.

#### Type Definition

```typescript
export interface Value<V = unknown> extends Signal {
	/** Equality function */
	equals: Equals;
	/** Signals that read from this signal */
	reactions: null | Reaction[];
	/** Read version */
	rv: number;
	/** The latest value for this signal */
	v: V;
	/** Write version */
	wv: number;
}

export type Source<V = unknown> = Value<V>;
```

#### Key Properties

- **`v`**: The actual value stored in the source
- **`reactions`**: Array of all reactions (effects, deriveds) that read from this source
- **`equals`**: Function to determine if a new value is different from the current one
- **`rv`/`wv`**: Read/write versions for optimization and dependency tracking

#### Examples in Svelte Code

```javascript
// $state() creates a source (runes mode)
const count = $state(0); // Creates a Source<number>

// Proxy properties create sources (runes mode)
const obj = $state({ name: 'John' }); // obj.name becomes a Source<string>

// Store subscriptions create sources (legacy mode)
const store = writable(0); // Creates reactive source
```

### Reactions

A **Reaction** is anything that reads from sources and can be re-executed when those sources change.

#### Type Definition

```typescript
export interface Reaction extends Signal {
	/** The associated component context */
	ctx: null | ComponentContext;
	/** The reaction function */
	fn: null | Function;
	/** Signals that this signal reads from */
	deps: null | Value[];
}
```

#### Types of Reactions

1. **Effects** - Side effects that run when dependencies change
2. **Derived signals** - Computed values that update when dependencies change
3. **Template effects** - DOM updates, text content changes, etc.

#### Key Properties

- **`fn`**: The function that gets re-executed when dependencies change
- **`deps`**: Array of all sources this reaction reads from
- **`ctx`**: Component context for cleanup and lifecycle management

#### Examples in Svelte Code

```javascript
// $effect creates a reaction (runes mode)
$effect(() => {
	console.log(count); // Reads from count source, creates dependency
});

// $derived creates a derived reaction (runes mode)
const doubled = $derived(count * 2);

// Reactive statements create reactions (legacy mode)
$: doubled = count * 2;

// Template expressions create reactions (both modes)
{
	count;
} // Creates template effect that updates DOM when count changes
```

### The Dependency Graph

The reactivity system works by building a **bidirectional dependency graph**:

```
Source                    ←→                    Reaction
┌─────────────────┐                      ┌─────────────────┐
│ count           │                      │ effect(() => {  │
│ v: 5            │                      │   console.log(  │
│ reactions: [→]  │ ──────────────────→ │     count       │
│                 │                      │   )             │
└─────────────────┘                      │ deps: [←]       │
                                         │ })              │
                                         └─────────────────┘
```

#### How It Works

1. **Dependency Registration**: When a reaction reads a source (via `get()`), the source adds the reaction to its `reactions` array, and the reaction adds the source to its `deps` array

2. **Change Propagation**: When a source changes (via `set()`), it iterates through its `reactions` array and marks each reaction as dirty to be re-executed

3. **Cleanup**: When reactions are destroyed, they're removed from their sources' `reactions` arrays

### Critical Insight for This Bug

The reactivity system is elegant but **sensitive to timing** - sources and reactions must be properly connected during the initial read, or the entire reactive chain breaks down. The bug occurs because:

- **Dependency registration in `get()` depends on having the correct `active_reaction` context**
- **Mount rendering creates a different effect hierarchy than template rendering**
- **The first `{#if}` block fails dependency registration**, meaning its effect never gets added to the source's `reactions` array
- **When the source changes, that effect never gets marked as dirty**, breaking conditional rendering

## Reproduction Case

### Minimal Setup

- **Component:** `nested.svelte` with two identical `{#if stateObjectFromContext.showText === true}` blocks
- **State:** `$state({ showText: true })` created in mount context and passed via context map
- **Mount Method:** Programmatic via `mount(NestedComponent, { context: Map })`
- **Trigger:** Button click with arrow function syntax: `onclick={() => toggleState()}`

### Bug Manifestation

**Expected Behavior:** Both if-blocks should show/hide together when state changes

**Actual Buggy Behavior:**

- First if-block gets "stuck" and doesn't update when state changes
- Second if-block works correctly and updates as expected
- Only the first conditional rendering block in mount mode fails dependency registration

### Key Discovery

The issue was initially obscured by incorrect button click handler syntax. Using `onclick={toggleState}` instead of `onclick={() => toggleState()}` can cause context binding issues. The working test uses proper arrow function syntax.

## Root Cause Analysis: Dependency Registration Failure

### The Core Issue

The bug stems from a **dependency registration failure** in the `get()` function (runtime.js:948) where proxy property signals are inappropriately added to `reaction_sources` during creation:

```javascript
// The check that causes the problem:
if (!reaction_sources?.includes(signal)) {
	// Register dependency - this gets skipped when signal is in reaction_sources
}
```

### Why Mount Mode Breaks

**The Context Problem**: In mount mode, proxy property signals are created within effect contexts, causing them to be added to `reaction_sources`:

**Mount Context Creation:**

1. **Mount Effect Active**: `active_reaction` is set to the mount effect
2. **Proxy Access**: First `{#if}` block accesses `stateObjectFromContext.showText`
3. **Signal Creation**: Proxy creates signal using `state()` (before fix)
4. **Wrong Addition**: `push_reaction_value()` adds the signal to `reaction_sources` array
5. **Registration Failure**: Later access finds signal in `reaction_sources`, skips dependency registration
6. **Missing Dependency**: The if-block effect never gets added to the signal's `reactions` array
7. **Broken Reactivity**: State changes don't trigger the first conditional's updates

**Template Mode Works**: Proxy properties are accessed in normal render context where `reaction_sources` remains `null`, allowing proper dependency registration.

### Evidence: The Missing Effect

**Critical Finding**: The first `{#if}` block effect is completely missing from the state source's reactions array in both modes:

```javascript
// State change triggers this in sources.js:
source.reactions?.forEach((reaction) => {
	// Second if-block effect: ✓ Present
	// First if-block effect:  ✗ Missing!
});
```

**Result**: Only the second `{#if}` block gets notified of state changes, while the first remains "stuck" showing stale values.

### Mount vs Template Sequences

**Mount (Broken)**:

```
mount effect → mount component → access proxy property → create signal with state() → reaction_sources=[signal] → registration fails
```

**Template (Working)**:

```
render component → access proxy property → create signal with source() → reaction_sources=null → registration succeeds
```

## Key Evidence

### Critical Log Analysis

**State Change Event:**

```
service.svelte.ts:21 Changing state from true to false
sources.js:185 internal_set {f: 0, v: false, reactions: Array(3), rv: 46, equals: ƒ, …} false
```

**Reactions Array Content:**

```
sources.js:191 reaction get_effect_parents (25) [
  0: {effectType: 'RENDER_EFFECT + BRANCH_EFFECT + CLEAN + EFFECT_RAN', component: 'NestedComponent.svelte'}  // ← Second if block
  1: {effectType: 'RENDER_EFFECT + BLOCK_EFFECT + CLEAN + EFFECT_RAN', component: 'NestedComponent.svelte'}
  2: {effectType: 'RENDER_EFFECT + BRANCH_EFFECT + CLEAN + EFFECT_RAN', component: 'NO_COMPONENT'}
  // ... 22 more effects
]
// MISSING: First if-block effect is not in this array!
```

**The smoking gun:** The first `{#if}` block effect is completely absent from the state source's reactions array, while the second `{#if}` block effect is present at index 0.

## Key Discoveries During Investigation

### First If Block Bug vs Subsequent Ones Work

When adding multiple if blocks in the same component:

```svelte
{#if stateObjectFromContext.showText === true}
	<h1>{stateObjectFromContext.showText}</h1>
	<!-- BROKEN -->
{/if}

{#if stateObjectFromContext.showText === true}
	<h2>{stateObjectFromContext.showText}</h2>
	<!-- WORKS -->
{/if}
```

**Key Finding:** The **first if block has the bug** but **subsequent if blocks work correctly** in both runes and legacy modes.

### $inspect Accidentally Fixes the Bug

Adding `$inspect(stateObjectFromContext.showText)` fixes the conditional rendering by forcing `$.run()` and `$.get()` usage, which creates proper reactive dependency tracking.

### Investigation History

During the analysis, we explored several approaches that proved to be red herrings:

- **Effect hierarchy and timing issues**: Investigated `pop()` timing, effect parent relationships, and context restoration
- **Race condition analysis**: Examined effect creation timelines and `parentType: undefined` issues
- **Effect transparency flags**: Tested EFFECT_TRANSPARENT modifications
- **Artificial delays**: Confirmed workarounds but didn't address root cause

These investigations were valuable for ruling out other potential causes and confirming the focus should be on dependency registration in the `get()` function.

## Testing Strategy

### Test Focus

The implemented test targets the core bug with surgical precision:

1. **Primary Case:** First `{#if}` block fails to update in programmatically mounted components
2. **Verification:** Both if-blocks should behave identically when state changes
3. **Scope:** Runes mode with context passing and state reactivity
4. **Method:** Button click triggers state change, HTML assertions verify DOM updates

### Test Coverage

- ✅ **Mount with Context:** Component mounted via `mount()` API with context map
- ✅ **State Reactivity:** `$state()` object passed through context and accessed in child
- ✅ **Conditional Rendering:** Multiple `{#if}` blocks reading same reactive state
- ✅ **Event Handling:** Button click with proper arrow function syntax
- ✅ **DOM Verification:** Precise HTML assertions for before/after state changes

**Note:** This supersedes the complex test plan in `test_plan.md`. The working implementation is much simpler and more focused than originally anticipated.

## Fix Implementation

### Location

**File:** `svelte/src/internal/client/proxy.js`  
**Lines:** Multiple locations where proxy properties are created

### The Actual Fix

The fix changes proxy.js to use `source()` instead of `state()` when creating proxy property signals.

**Key change:** Switch from using `state()` to `source()` for proxy properties, which prevents signals from being added to `reaction_sources` during creation.

### Key Difference Between Functions

From `sources.js`:

```javascript
// source() - just creates signal, no side effects
export function source(v, stack) {
	var signal = {
		f: 0,
		v,
		reactions: null,
		equals,
		rv: 0,
		wv: 0
	};
	return signal;
}

// state() - creates signal AND calls push_reaction_value()
export function state(v, stack) {
	const s = source(v, stack);
	push_reaction_value(s); // ← ADDS TO reaction_sources!
	return s;
}
```

### Explanation

The root cause was that proxy properties were being created with `state()`, which calls `push_reaction_value()` and adds the signal to the `reaction_sources` array during creation. This caused the dependency registration check `!reaction_sources?.includes(signal)` to fail later.

By using `source()` instead of `state()` for proxy properties, the signals don't get added to `reaction_sources` during creation, allowing proper dependency registration when the first `{#if}` block accesses them.
