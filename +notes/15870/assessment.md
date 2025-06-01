# Comprehensive Svelte Mount vs Template Rendering Bug Analysis

## Bug Overview

Programmatically mounted components using `mount()` exhibit fundamentally different conditional rendering behavior compared to template-rendered components, specifically affecting `{#if}` block lifecycle management and effect context hierarchy.

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
// $state() creates a source
const count = $state(0); // Creates a Source<number>

// Proxy properties create sources
const obj = $state({ name: 'John' }); // obj.name becomes a Source<string>
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
// $effect creates a reaction
$effect(() => {
	console.log(count); // Reads from count source, creates dependency
});

// $derived creates a derived reaction
const doubled = $derived(count * 2);

// Template expressions create reactions
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
└─────────────────┘                      │ })              │
                                         │ deps: [←]       │
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

### Test Setup

- **Component:** `NestedComponent.svelte` with conditional `{#if stateObjectFromContext.showText === true}`
- **State:** `$state({ showText: true })` that toggles every 1000ms
- **Mount Method A:** Template rendering via `<NestedComponent />`
- **Mount Method B:** Programmatic via `mount(NestedComponent, { context: Map })`

### Expected Behavior

Conditional should only show content when `showText === true`, pausing effects when `false`.

### Actual Behavior

- **Template:** Works correctly, shows proper effect pausing
- **Mount:** Shows both true/false values, missing effect pausing

## CONFIRMED ROOT CAUSE: First IF BLOCK Missing from Reactions Array

### Critical Discovery from internal_set Logging

**CONFIRMED:** The fundamental issue is that **the first `{#if}` block is NOT added to the state source's reactions array**, while the second `{#if}` block IS properly added.

**Evidence from `internal_set` logs:**

```javascript
// When stateObject.showText changes from true to false:
console.debug('internal_set', source, value);
source.reactions?.forEach((reaction) => {
	// Shows reactions for SECOND if block (h2) but NOT FIRST if block (h1)
	console.debug('reaction log_effect_processing', log_effect_processing(reaction_as_effect));
});
```

**Log Analysis:**

- **State source reactions array contains:** Second `{#if}` block effect (wrapping `<h2>`)
- **State source reactions array MISSING:** First `{#if}` block effect (wrapping `<h1>`)
- **Result:** When state changes, only the second if block gets marked as DIRTY and processes the conditional logic
- **Consequence:** First if block bypasses conditional logic entirely, shows both true/false values

### Why This Breaks Conditional Rendering

**Normal Flow (Working - Second IF Block):**

1. State changes: `stateObject.showText = false`
2. `internal_set()` called
3. `mark_reactions()` iterates through `source.reactions`
4. Second if block effect found in reactions array
5. Effect marked as DIRTY
6. `update_branch()` called → `pause_effect()` called
7. Conditional content properly hidden

**Broken Flow (First IF Block):**

1. State changes: `stateObject.showText = false`
2. `internal_set()` called
3. `mark_reactions()` iterates through `source.reactions`
4. **First if block effect NOT FOUND in reactions array**
5. **Effect never marked as DIRTY**
6. **`update_branch()` never called**
7. **Direct `set_text()` calls bypass conditional logic**
8. Shows both true/false values

### Key Evidence from Logs

**From `internal_set` debug logs:**

```
service.svelte.ts:21 Changing state from true to false
sources.js:185 internal_set {f: 0, v: false, reactions: Array(3), ...} false

// Reaction 1: Second IF block (h2) - PRESENT ✓
sources.js:189 reaction log_effect_processing {
	effectType: 'RENDER_EFFECT + BLOCK_EFFECT + CLEAN + EFFECT_RAN',
	component: 'src/routes/15870/components/NestedComponent.svelte'
}

// Reaction 2: Another effect related to second IF block - PRESENT ✓
sources.js:189 reaction log_effect_processing {
	effectType: 'RENDER_EFFECT + BLOCK_EFFECT + CLEAN + EFFECT_RAN',
	component: 'src/routes/15870/components/NestedComponent.svelte'
}

// Reaction 3: Third effect - PRESENT ✓
// BUT NO REACTION FOR FIRST IF BLOCK (h1) - MISSING ✗
```

**Critical Finding:** `reactions: Array(3)` shows 3 reactions are registered, but analysis reveals none correspond to the first `{#if}` block wrapping the `<h1>`.

## NEW FINDINGS: Core Issue Identified

### Root Cause: IF BLOCK Effects Not Marked as DIRTY

**Critical Discovery:** The fundamental issue is that **IF BLOCK effects are not being marked as DIRTY** when the state changes in mount mode.

**Evidence from Debugging:**

1. **State Assignment Works:** `stateObject.showText = !stateObject.showText` properly triggers the proxy setter
2. **Reactive Chain Starts:** `mark_reactions()` is called through `internal_set()` → `mutate()` → `mark_reactions()`
3. **IF BLOCK Missing from Chain:** The IF BLOCK effects are never marked as DIRTY, so `pause_effect()` is never called
4. **Direct Text Updates:** Instead of conditional logic, the system falls back to direct `set_text()` calls

### Evidence: Effect Processing Logs

**Working Template Log:**

```
if.js update_branch true {previousCondition: Symbol(), conditionChanged: true}
if.js update_branch: condition is truthy
if.js update_branch null {previousCondition: true, conditionChanged: true}
if.js pausing consequent_effect - THIS SHOULD HAPPEN IN MOUNT!
effects.js pause_effect called: {effectType: 'BRANCH', hasChildren: true}
```

**Broken Mount Log:**

```
render.js set_text "false" false
render.js set_text "true" true
render.js set_text "false" false
(no update_branch calls, no pause_effect calls)
```

**Key Difference:** Template shows `update_branch` → `pause_effect` chain, mount shows only `set_text` calls.

### Effect Dependency Investigation

**Call Chain for State Changes:**

1. `stateObject.showText = !stateObject.showText` (proxy setter)
2. `internal_set()` called on the state source
3. `mutate()` called to mark dependencies
4. `mark_reactions()` iterates through `source.reactions`
5. **PROBLEM:** First IF BLOCK effects are missing from `source.reactions` array

**Why First IF BLOCK Missing:**

- First IF BLOCK effects should be in the `reactions` array of the state source
- When state changes, `mark_reactions()` should mark these effects as DIRTY
- **Mount mode:** First IF BLOCK effects never get added to `reactions` array
- **Template mode:** All IF BLOCK effects properly added to `reactions` array

## Detailed Log Analysis

### Key Evidence: Effect Context Disruption

**Template Log (Working) - Line 15:**

```
create_effect: RENDER {type: 8, hasParent: true, parentType: '8', sync: false, push: true}
```

**Mount Log (Broken) - Line 47:**

```
create_effect: RENDER {type: 8, hasParent: true, parentType: undefined, sync: true, push: true}
```

**Critical Finding:** `parentType: undefined` indicates corrupted effect hierarchy in mount mode.

### Conditional Branch Behavior Differences

**Template Log - Lines 49-52:**

```
if.js update_branch true {previousCondition: Symbol(), conditionChanged: true, hasConsequentEffect: false, hasAlternateEffect: false}
if.js update_branch: condition is truthy {consequent_effect: false, alternate_effect: false, willResumeConsequent: false, willPauseAlternate: false}
if.js creating new consequent_effect
render.js set_text "true" true {activeEffect: true, activeEffectParent: 'HAS_PARENT', activeEffectType: 'RENDER', effectChain: 'RENDER → BRANCH → RENDER → BRANCH → RENDER'}
```

**Template Log - Lines 77-80 (State Change):**

```
if.js update_branch null {previousCondition: true, conditionChanged: true, hasConsequentEffect: true, hasAlternateEffect: false}
if.js update_branch: condition is falsy {consequent_effect: true, alternate_effect: false, willResumeAlternate: false, willPauseConsequent: true}
if.js pausing consequent_effect - THIS SHOULD HAPPEN IN MOUNT!
effects.js pause_effect called: {effectType: 'BRANCH', hasChildren: true}
```

**Mount Log - Lines 88-109 (Broken Pattern):**

```
render.js set_text "false" false {activeEffect: true, activeEffectParent: 'HAS_PARENT', activeEffectType: 'RENDER', effectChain: 'RENDER → BRANCH → RENDER → BRANCH → RENDER'}
render.js set_text "true" true {activeEffect: true, activeEffectParent: 'HAS_PARENT', activeEffectType: 'RENDER', effectChain: 'RENDER → BRANCH → RENDER → BRANCH → RENDER'}
render.js set_text "false" false {activeEffect: true, activeEffectParent: 'HAS_PARENT', activeEffectType: 'RENDER', effectChain: 'RENDER → BRANCH → RENDER → BRANCH → RENDER'}
```

**Key Difference:** Template version calls `pause_effect`, mount version shows alternating `set_text` calls without pausing.

## NEXT INVESTIGATION: Why First IF BLOCK Effect Not in Reactions Array

### Key Questions to Answer:

1. **Dependency Registration:** When/where should first IF BLOCK effects be added to `state.reactions`?
2. **Mount vs Template Difference:** Why does template rendering properly register first if dependencies but mount doesn't?
3. **Effect Creation Timing:** Are first IF BLOCK effects created before or after dependency registration?
4. **Reactive Access Pattern:** How does the first `stateObjectFromContext.showText` access differ from subsequent ones?

### Investigation Points:

**A. Dependency Registration in `get()` function:**

```javascript
// From runtime.js get() function
if (active_reaction !== null && !untracking) {
	// This should add the first IF BLOCK effect to state.reactions
	// WHY is this failing for the first but working for second IF block?
}
```

**B. First vs Subsequent IF BLOCK Effect Creation:**

```javascript
// In if.js if_block function
// Why does the first if_block fail dependency registration?
// What makes the second if_block work correctly?
```

**C. State Access Pattern Analysis:**

```javascript
// First access: stateObjectFromContext.showText === true (BROKEN)
// Second access: stateObjectFromContext.showText === true (WORKS)
// What's different about the reactive context during first vs second access?
```

### Files to Investigate:

1. **`runtime.js`** - `get()` function dependency registration for first vs subsequent calls
2. **`if.js`** - First vs second IF BLOCK effect creation differences
3. **`sources.js`** - How reactions array is managed during multiple if block creation
4. **`effects.js`** - Effect creation timing and dependency tracking differences

### Debugging Approach:

1. **Add logging to `get()` function** when `stateObjectFromContext.showText` is accessed during first vs second if block
2. **Log `active_reaction`** during state access for both if blocks
3. **Track `state.reactions` array** to see when first vs second IF BLOCK effects are added/missing
4. **Compare effect creation timing** between first and second if blocks in mount mode

## Code Path Investigation

### File: `node_modules/svelte/src/internal/client/render.js`

**Problematic Code (Lines 285-300):**

```javascript
var unmount = component_root(() => {
	var anchor_node = anchor ?? target.appendChild(create_text());

	branch(() => {
		if (context) {
			push({}); // Line 290
			var ctx = /** @type {ComponentContext} */ (component_context);
			ctx.c = context; // Line 292
		}

		should_intro = intro;
		component = Component(anchor_node, props) || {}; // Line 296 - Component creation
		should_intro = true;

		if (context) {
			pop(); // Line 300 - PROBLEM: Too early!
		}
	});
});
```

**Critical Issue:** `pop()` called on line 300 immediately after component creation (line 296), but before component's effect tree is established.

### File: `node_modules/svelte/src/internal/client/context.js`

**pop() Function (Lines 142-168):**

```javascript
export function pop(component) {
	console.debug('pop: setting mounted flag', { m: true });
	const context_stack_item = component_context;
	if (context_stack_item !== null) {
		// Effect processing happens here
		const component_effects = context_stack_item.e;
		if (component_effects !== null) {
			// ... effect processing code
		}
		component_context = context_stack_item.p; // Line 161 - Context restoration
		context_stack_item.m = true; // Line 165 - Set mounted flag
	}
	return component || {};
}
```

**Issue:** Line 161 restores `component_context` to parent before child component's effects are established.

### File: `node_modules/svelte/src/internal/client/dom/blocks/if.js`

**update_branch Function (Lines 55-105):**

```javascript
const update_branch = (new_condition, fn) => {
	console.debug('update_branch', new_condition, {
		previousCondition: condition,
		conditionChanged: condition !== new_condition,
		hasConsequentEffect: !!consequent_effect,
		hasAlternateEffect: !!alternate_effect
	});

	if (condition === (condition = new_condition)) return;

	if (condition) {
		// ... truthy logic
	} else {
		// ... falsy logic
		if (consequent_effect) {
			console.debug('pausing consequent_effect - THIS SHOULD HAPPEN IN MOUNT!');
			pause_effect(consequent_effect, () => {
				consequent_effect = null;
			});
		}
	}
};
```

**Key:** Lines 98-103 should pause effects when condition becomes falsy, but this doesn't happen in mount mode due to corrupted effect context.

## Failed Fix Attempts - Detailed Analysis

### Failed Attempt #1: Moving pop() to Cleanup Function

**Original Code (render.js:300):**

```javascript
branch(() => {
	if (context) {
		push({});
		var ctx = component_context;
		ctx.c = context;
	}
	component = Component(anchor_node, props) || {};
	if (context) {
		pop(); // Called here originally
	}
});
```

**Failed Fix:**

```javascript
branch(() => {
	if (context) {
		push({});
		var ctx = component_context;
		ctx.c = context;
	}
	component = Component(anchor_node, props) || {};
	// Removed pop() from here
});

return () => {
	if (context) {
		pop(); // Moved to cleanup - WRONG!
	}
	// ... other cleanup
};
```

**Why It Failed:**

1. **Wrong Lifecycle Phase:** Cleanup function runs during **unmount**, not after mount completion
2. **Context Never Restored:** `component_context` remains pushed throughout entire component lifecycle
3. **Memory Leak:** Context stack grows indefinitely with multiple mounts
4. **Effect Hierarchy Still Corrupted:** The timing issue remains - effects created before context is properly established
5. **No Functional Change:** Mount behavior remains identical since cleanup only runs on unmount

**Evidence:** Mount log still shows `parentType: undefined` and missing `pause_effect` calls.

### Failed Attempt #2: Wrapping pop() in effect()

**Failed Fix:**

```javascript
if (context) {
	effect(() => {
		pop();
	});
}
```

**Why It Failed:**

1. **Asynchronous Scheduling:** `effect()` schedules the pop operation for next microtask, creating race condition
2. **Wrong Effect Type:** `effect()` creates a regular effect (type: EFFECT), not a sync operation
3. **Deferred Execution Problem:** Component creation completes with context still pushed, then pop() runs later
4. **Effect Context Corruption:** By the time pop() runs, child effects are already created with wrong parent context
5. **Timing Dependency:** Success depends on when the scheduled effect runs relative to state changes

**Technical Analysis:**

```javascript
// From effects.js:292
export function effect(fn) {
	return create_effect(EFFECT, fn, false); // sync = false!
}
```

The `sync: false` parameter means the effect is scheduled, not executed immediately. This introduces timing dependency where component effects are created before the context cleanup runs.

### Failed Attempt #3: Modifying if_block with ~EFFECT_TRANSPARENT

**Failed Fix:**

```javascript
// In if.js if_block function
block(() => {
	has_branch = false;
	fn(set_branch);
	if (!has_branch) {
		update_branch(null, null);
	}
}, flags & ~EFFECT_TRANSPARENT);
```

**Why It Failed:**

1. **Wrong Problem Target:** This addresses effect transparency, not context corruption
2. **EFFECT_TRANSPARENT Misunderstanding:** This flag controls transition boundaries, not effect parent context
3. **No Context Impact:** Removing EFFECT_TRANSPARENT doesn't affect the `component_context` corruption
4. **Unchanged Effect Hierarchy:** The `parentType: undefined` issue remains unchanged
5. **Bark vs. Tree:** This fixes a symptom (transition behavior) rather than the root cause (context timing)

**Technical Analysis:**

```javascript
// From constants.js:17
/** 'Transparent' effects do not create a transition boundary */
export const EFFECT_TRANSPARENT = 1 << 16;
```

`EFFECT_TRANSPARENT` only affects transition boundaries. The actual problem is in the `create_effect` function where `parent` and `ctx` are captured:

```javascript
// From effects.js:84-95
function create_effect(type, fn, sync, push = true) {
	var parent = active_effect; // Wrong parent due to early pop()
	var effect = {
		ctx: component_context, // Wrong context due to early pop()
		parent // Wrong parent reference
		// ... other properties
	};
}
```

### Failed Attempt #4: Artificial Delays (Workaround Only)

**Implementation:**

```javascript
setTimeout(() => {
	setInterval(() => {
		stateObject.showText = !stateObject.showText;
	}, 1000);
}, 2000); // 2 second delay
```

**Why It "Works":**

- Allows full mount completion before state changes
- Mount log with delay shows correct `pause_effect` calls
- Effect context stabilized by time of state change

**Why It's Not a Real Fix:**

- Doesn't address root cause of effect context corruption
- Brittle timing-dependent solution
- Impractical for real applications
- Still shows `parentType: undefined` during mount

### Failed Attempt #5: Completely Removing pop() Call

**Critical Discovery:**

```javascript
if (context) {
	// pop(); // Completely commented out
}
```

**Result:** **Issue still persists** - conditional rendering still broken in mount mode.

**Why This Is Significant:**

1. **pop() timing is NOT the root cause** - the issue runs deeper
2. **Effect hierarchy corruption happens independently** of context restoration
3. **The problem originates during component initialization** itself, not during cleanup
4. **Fundamental difference in effect creation** between template and mount rendering

**Evidence:** Even without any pop() call, mount logs still show:

- `parentType: undefined` effects being created
- Missing `update_branch` calls during state changes
- Direct `set_text` calls bypassing conditional logic
- No `pause_effect` calls when condition becomes falsy

**Conclusion:** The context restoration timing was a red herring. The real issue is in how the effect dependency graph is established during mount vs template rendering.

## Root Cause Analysis: Fundamental Effect Dependency Graph Corruption

### The Real Issue: Different Effect Creation Patterns

Based on the critical discovery that **completely removing pop() doesn't fix the issue**, the problem is not context restoration timing but rather **fundamental differences in how effect dependency graphs are built** during mount vs template rendering.

The problem occurs in `create_effect()` function (effects.js:84-95):

```javascript
function create_effect(type, fn, sync, push = true) {
	var parent = active_effect; // Line 84 - Captures current active_effect
	var effect = {
		ctx: component_context, // Line 95 - Captures current component_context
		parent // Line 100 - Wrong parent even without pop()
		// ... other properties
	};
}
```

**The True Problem Sequence (Even Without pop()):**

1. `mount()` calls `component_root()` → creates ROOT_EFFECT
2. `branch()` called → creates BRANCH_EFFECT with different context than template
3. `Component()` called → creates effects in **fundamentally different environment** than template
4. Effect parent chain established incorrectly from the start
5. Dependency tracking broken between state changes and conditional rendering
6. `if_block` effects cannot properly pause/resume because dependency graph is malformed

**Key Insight:** Template rendering creates a naturally hierarchical effect tree through the component lifecycle, while mount rendering creates effects in an artificial root context that breaks the dependency chain needed for conditional rendering to work.

### Effect Hierarchy Comparison

**Template (Correct):**

```
App Context
└── App RENDER_EFFECT
    └── NestedComponent Context (maintained by template)
        └── NestedComponent RENDER_EFFECT
            └── if_block BRANCH_EFFECT
                └── Text RENDER_EFFECT
```

**Mount (Broken):**

```
App Context
└── ROOT_EFFECT
    └── BRANCH_EFFECT
        └── NestedComponent Context (popped too early)
            └── NestedComponent RENDER_EFFECT (wrong parent context)
                └── if_block BRANCH_EFFECT (wrong parent context)
                    └── Text RENDER_EFFECT (wrong parent context)
```

## Race Condition Analysis

### Timeline Comparison

**Template Rendering:**

1. Parent component starts rendering
2. `<NestedComponent />` encountered
3. Component context pushed
4. NestedComponent effects created within stable context
5. Component rendering completes
6. Context naturally maintained by parent
7. State changes → proper pause/resume behavior

**Mount Rendering (Broken):**

1. `mount()` called
2. `component_root()` creates ROOT effect
3. `branch()` creates BRANCH effect
4. `push({})` creates component context
5. `Component()` called, creates child effects
6. **`pop()` called immediately** ← PROBLEM
7. Context restored to parent while child effects still initializing
8. State changes → corrupted effect hierarchy

### Evidence: Effect Creation Timeline

**Mount Log Lines 46-52:**

```
create_effect: ROOT {type: 64, hasParent: true, parentType: undefined, sync: true, push: true}
create_effect: RENDER {type: 40, hasParent: true, parentType: '64', sync: true, push: true}
push: creating component context {runes: false, m: false}
create_effect: RENDER {type: 8, hasParent: true, parentType: '8', sync: false, push: true}
NestedComponent executing
create_effect: UNKNOWN {type: 262144, hasParent: true, parentType: '8', sync: true, push: true}
```

**Problem:** `parentType: undefined` on line 46 shows ROOT effect created without proper parent context.

## Debugging Evidence

### Console Output Patterns

**Template (Working) Pattern:**

```
NestedComponent executing
if_block creating branch effect
update_branch true (initial)
set_text "true" (once)
--- state change ---
update_branch null (falsy)
pause_effect called ✓
--- state change ---
update_branch true (truthy)
resume_effect called ✓
```

**Mount (Broken) Pattern:**

```
NestedComponent executing
if_block creating branch effect
update_branch true (initial)
set_text "true" (once)
--- state change ---
set_text "false" ✗
set_text "true" ✗
set_text "false" ✗
(no pause_effect calls)
```

### Effect Type Investigation

**Constants from `node_modules/svelte/src/internal/client/constants.js`:**

```javascript
export const RENDER_EFFECT = 1 << 3; // 8
export const BRANCH_EFFECT = 1 << 4; // 16
export const BLOCK_EFFECT = 1 << 5; // 32
export const ROOT_EFFECT = 1 << 6; // 64
```

**Effect Type Analysis:**

- `type: 8` = RENDER_EFFECT
- `type: 24` = RENDER_EFFECT | BRANCH_EFFECT (8 + 16)
- `type: 40` = RENDER_EFFECT | ??? (needs investigation)
- `type: 64` = ROOT_EFFECT
- `type: 262144` = Unknown (possible INSPECT_EFFECT)

## Proposed Fix - Technical Details

### Solution: Reconstruct Effect Hierarchy to Match Template Rendering

**Understanding Required:** Since the issue is fundamental to how mount creates effects vs template rendering, the fix requires reconstructing the effect dependency graph to match template behavior.

**Areas Requiring Investigation:**

1. **Effect Parent Chain:** How template rendering naturally creates hierarchical effects vs mount's artificial root context
2. **Dependency Tracking:** Why state changes trigger `update_branch` calls in template but not mount
3. **Component Context Integration:** How template components inherit proper reactive context vs mount isolation
4. **Conditional Effect Creation:** Why `if_block` effects work correctly in template but bypass logic in mount

**Potential Fix Approaches:**

1. **Modify `component_root()` behavior** to better mimic template component creation
2. **Adjust effect creation in mount path** to establish proper parent relationships
3. **Fix dependency tracking** between state and conditional rendering effects
4. **Ensure proper reactive context inheritance** during mount

**This requires deeper investigation into:**

- How template rendering establishes effect hierarchy
- What specific effect relationships are missing in mount mode
- How to recreate the natural component lifecycle that template rendering provides

### Expected Log Changes After Fix

**Mount log should show:**

1. `parentType: '8'` instead of `undefined` (proper effect parent relationships)
2. `update_branch` calls during state changes (dependency tracking working)
3. `pause_effect called` when conditions become falsy (conditional logic working)
4. Single `set_text` calls instead of alternating patterns (proper conditional rendering)
5. Effect hierarchy matching template rendering (consistent behavior)
6. Mount and template logs showing identical conditional rendering patterns

## Testing Requirements

### Verification Checklist

- [ ] Effect hierarchy matches template rendering
- [ ] `parentType` shows proper parent instead of `undefined`
- [ ] `pause_effect` called when conditional becomes falsy
- [ ] `resume_effect` called when conditional becomes truthy
- [ ] Single `set_text` calls during state changes
- [ ] No performance degradation
- [ ] Existing mount() API compatibility maintained

### Test Cases

1. **Basic conditional rendering** (current bug case)
2. **Nested conditionals** (`{#if outer}{#if inner}`)
3. **Multiple mount calls** (ensure no context leakage)
4. **Mount with immediate state changes** (race condition test)
5. **Mount without context** (ensure no regression)
6. **Complex effect hierarchies** (multiple components)

## Files Requiring Changes

1. **`src/internal/client/render.js`** - Primary fix location
2. **`src/internal/client/reactivity/effects.js`** - Import `teardown` if needed
3. **Tests** - Add comprehensive mount vs template tests
4. **Documentation** - Update mount() behavior documentation

## Additional Investigation Findings

### Critical Discovery: Bug Persists Even with Runes Mode

**Forced Runes Compilation:**

Even when forcing runes mode with `$.push($$props, true, NestedComponent)`, the bug persists:

```javascript
function NestedComponent($$anchor, $$props) {
	$.check_target(new.target);
	$.push($$props, true, NestedComponent); // Runes mode forced
	// ... rest of component
	$.if(node, ($$render) => {
		if ($.strict_equals(stateObjectFromContext.showText, true)) $$render(consequent);
	});
}
```

**Implications:**

- The bug is not related to legacy vs runes mode
- The issue exists in the core conditional rendering logic
- Effect creation patterns are fundamentally different regardless of compilation mode

### $inspect Accidentally Fixes the Bug

**Key Finding:** Adding `$inspect(stateObjectFromContext.showText)` fixes the conditional rendering.

**Compiled Difference Analysis:**

**Without $inspect (Broken):**

```javascript
$.if(node, ($$render) => {
	if ($.strict_equals(stateObjectFromContext.showText, true)) $$render(consequent);
});
```

**With $inspect (Fixed):**

```javascript
var stateObjectFromContext = $.run(() => getContext('stateContext'));
// ... later ...
$.if(node, ($$render) => {
	if ($.strict_equals($.get(stateObjectFromContext), true)) $$render(consequent);
});
```

**Critical Difference:**

- **Without $inspect:** Direct property access `stateObjectFromContext.showText`
- **With $inspect:** Reactive access via `$.get(stateObjectFromContext)` with `$.run()` wrapper

**Why $inspect Fixes It:**

1. `$.run()` creates proper reactive dependency tracking
2. `$.get()` ensures reactive reads are tracked
3. The conditional becomes properly reactive instead of static

### First If Block Bug vs Subsequent Ones Work

**Multi-If Test Results:**

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

**Key Finding:** The **first if block has the bug** but **subsequent if blocks work correctly**.

**Implications:**

- The bug affects the **first reactive access** in the component
- Subsequent reactive accesses work properly
- This suggests an **initialization timing issue** with the first reactive dependency
- The effect dependency graph is corrupted only for the first conditional

### Debugging Stack Trace Analysis

**Stack Trace When Hitting block() Function:**

```
block (effects.js:387)
wrapper (hmr.js:28)
(anonymous) (render.js:269)
update_reaction (runtime.js:414)
update_effect (runtime.js:580)
create_effect (effects.js:144)
branch (effects.js:396)
(anonymous) (render.js:251)
_mount (render.js:248)
hydrate (render.js:163)
Svelte4Component (legacy-client.js:113)
```

**Key Insights:**

- This is **SvelteKit framework initialization**, not the test component
- The actual bug occurs later in the component lifecycle
- Framework-level effects are being created properly
- The issue is specific to user component effect creation

### Improved Effect Type Logging

**Enhanced Debugging Information:**

Instead of cryptic numbers like `type: 24`, we need readable effect types:

```javascript
const EFFECT_TYPES = {
	8: 'RENDER_EFFECT',
	16: 'BRANCH_EFFECT',
	24: 'RENDER_EFFECT | BRANCH_EFFECT',
	32: 'BLOCK_EFFECT',
	40: 'RENDER_EFFECT | BLOCK_EFFECT',
	64: 'ROOT_EFFECT'
};
```

**Clearer Log Output:**

```
create_effect: RENDER_EFFECT | BRANCH_EFFECT {
	hasParent: true,
	parentType: 'ROOT_EFFECT',
	sync: true,
	component: 'NestedComponent'
}
```

### Updated Root Cause Understanding

**Revised Analysis:**

The bug is **not about `pop()` timing** but about **reactive dependency tracking initialization**:

1. **First reactive access** in mounted components fails to establish proper tracking
2. **$inspect fixes it** by forcing `$.run()` and `$.get()` usage
3. **Subsequent reactive accesses work** because the dependency graph is already established
4. **Template rendering works** because it naturally creates reactive dependencies
5. **Mount rendering fails** because the first reactive access isn't properly tracked

**The Real Problem:**

```javascript
// Broken (direct access)
if (stateObjectFromContext.showText === true)

// Working (reactive access)
if ($.get(stateObjectFromContext) === true)
```

### Investigation Areas Still Needed

1. **Why does the first reactive access fail** in mounted components?
2. **How does template rendering** automatically create reactive dependencies?
3. **What makes subsequent if blocks work** when the first one fails?
4. **Can we force reactive tracking** for the first access without $inspect?
5. **Where in the compilation process** does the reactive vs non-reactive decision happen?

## Backward Compatibility

**API Changes:** None - `mount()` signature remains identical
**Behavior Changes:** Mount behavior becomes consistent with template rendering
**Performance Impact:** Minimal - defers one function call via existing effect system
**Breaking Changes:** None expected - fixes broken behavior rather than changing working behavior

## Root Cause Analysis: Dependency Registration Failure

### The Critical Mechanism: reaction_sources Check

The core issue lies in how Svelte's dependency registration system handles sources created during effect execution. There's a critical difference in behavior between the first and subsequent `{#if}` blocks.

#### Location 1: Initial Dependency Registration (runtime.js:897-950)

```javascript
export function get(signal) {
	// ...
	// Register the dependency on the current reaction signal.
	if (active_reaction !== null && !untracking) {
		if (!reaction_sources?.includes(signal)) {
			// ← THE CRITICAL CHECK
			var deps = active_reaction.deps;
			if (signal.rv < read_version) {
				signal.rv = read_version;
				// Add signal to new_deps for processing...
				if (new_deps === null && deps !== null && deps[skipped_deps] === signal) {
					skipped_deps++;
				} else if (new_deps === null) {
					new_deps = [signal]; // ← Signal gets queued for dependency registration
				} else if (!skip_reaction || !new_deps.includes(signal)) {
					new_deps.push(signal);
				}
			}
		}
	}
	// ...
}
```

#### Location 2: Reverse Dependency Registration (runtime.js:456-460)

```javascript
function update_reaction(reaction) {
	// ...
	if (!skip_reaction) {
		for (i = skipped_deps; i < deps.length; i++) {
			(deps[i].reactions ??= []).push(reaction); // ← EFFECT GETS ADDED TO SOURCE'S REACTIONS
		}
	}
	// ...
}
```

### The Exact Failure Sequence

#### First `{#if}` Block (h1 element) - FAILS Registration

1. **Property Access**: `stateObjectFromContext.showText` is accessed during render
2. **Source Creation**: `proxy.js:133` creates the source for `showText` property
3. **Critical Issue**: `reaction_sources` contains `[showTextSource]` because the source was just created within this reaction
4. **Check Fails**: `!reaction_sources?.includes(signal)` returns `false` because the signal IS in reaction_sources
5. **No Registration**: The signal is NOT added to `new_deps`
6. **No Reverse Link**: `update_reaction()` never adds this if-block effect to the source's `reactions` array
7. **Result**: Source has `reactions: []` (empty) - no effects will be notified when it changes

#### Second `{#if}` Block (p element) - SUCCEEDS Registration

1. **Property Access**: `stateObjectFromContext.showText` is accessed during render
2. **Source Reuse**: The source already exists from the first access
3. **Critical Difference**: `reaction_sources` is `null` because source wasn't created in this reaction
4. **Check Passes**: `!reaction_sources?.includes(signal)` returns `true` because reaction_sources is null
5. **Gets Registered**: The signal gets added to `new_deps`
6. **Reverse Link Created**: `update_reaction()` adds this if-block effect to the source's `reactions` array
7. **Result**: Source has `reactions: [secondIfBlockEffect, ...]` - these effects get notified on changes

### The State Change Impact

When `stateObjectFromContext.showText` changes from `true` to `false`:

1. **Source Update**: `internal_set()` in sources.js:185 updates the source value
2. **Notification Phase**: Lines 189-191 iterate through `source.reactions` array
3. **Missing Effect**: First if-block effect is NOT in the reactions array → never gets marked dirty
4. **Present Effect**: Second if-block effect IS in the reactions array → gets marked dirty and schedules update
5. **Visual Result**:
   - `<h1>` element remains visible (effect never runs to hide it)
   - `<p>` element correctly disappears (effect runs and updates DOM)

This explains why we see the "stale first conditional" behavior - the first `{#if}` block's effect simply never gets notified that its dependency changed, so it never re-evaluates the condition.

## Reproduction Case

### Test Setup

- **Component:** `NestedComponent.svelte` with conditional `{#if stateObjectFromContext.showText === true}`
- **State:** `$state({ showText: true })` that toggles every 1000ms
- **Mount Method A:** Template rendering via `<NestedComponent />`
- **Mount Method B:** Programmatic via `mount(NestedComponent, { context: Map })`

### Expected Behavior

Conditional should only show content when `showText === true`, hiding both elements when `false`.

### Actual Behavior

**Template rendering (✅ Works):** Both elements show/hide correctly together.

**Programmatic mounting (❌ Broken):**

- First conditional (`<h1>`) gets "stuck" - remains visible even when state is `false`
- Second conditional (`<p>`) works correctly - shows/hides as expected

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

## Technical Analysis

### Effect Context Hierarchy Differences

**Template Rendering Context:**

- Effects created within established component render context
- Proper parent-child effect relationships maintained
- Consistent `reaction_sources` behavior during dependency registration

**Programmatic Mount Context:**

- Effects created in different context hierarchy
- First effect encounters different `reaction_sources` state during source creation
- Subsequent effects encounter normal dependency registration flow

### The `reaction_sources` Variable

From `runtime.js:95-105`:

```javascript
/**
 * When sources are created within a reaction, reading them should not add to the reaction's
 * dependencies, as they were not created through external observation
 */
let reaction_sources = null;
```

This variable tracks sources created within the current reaction. The key insight:

- **First access**: Creates the source, so `reaction_sources = [source]`
- **Subsequent access**: Source exists, so `reaction_sources = null`

The dependency registration check `!reaction_sources?.includes(signal)` prevents self-dependencies but inadvertently blocks legitimate dependencies in certain mounting contexts.

## Resolution Direction

The fix likely involves ensuring consistent `reaction_sources` behavior regardless of mounting method, or modifying the dependency registration logic to handle source creation timing differences in programmatic vs template mounting scenarios.
