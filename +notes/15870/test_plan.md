# Test Plan: Mount vs Template Rendering Bug (Issue #15870)

## Overview

Create tests that verify the fix for the dependency registration failure when components are mounted programmatically vs template rendering. The tests should fail before the fix (line 948 in runtime.js) and pass after applying the fix.

**Important**: This bug affects **both runes and legacy runtimes** since it's in the core `get()` function that handles all signal dependency registration.

## Test Locations

**Runes Mode**: `packages/svelte/tests/runtime-runes/samples/mount-vs-template-rendering/_config.js`
**Legacy Mode**: `packages/svelte/tests/runtime-legacy/samples/mount-vs-template-rendering/_config.js`

## Key Differences Between Modes

| Aspect                 | Runes Mode                                             | Legacy Mode                                            |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| **State Management**   | `$state()`, `$derived()`                               | `let` variables, stores                                |
| **Reactivity**         | Signals-based                                          | Store subscriptions, reactive statements               |
| **Component Creation** | `mount()` API                                          | `createClassComponent()`                               |
| **Bug Impact**         | ❌ **Affected** - Signal dependency registration fails | ❌ **Affected** - Signal dependency registration fails |

## Test Structure

Following Svelte's established testing patterns discovered in the codebase:

### Directory Structure (Both Modes)

```
packages/svelte/tests/runtime-runes/samples/mount-vs-template-rendering/
├── _config.js           # Runes mode test configuration
├── main.svelte          # Template rendering test component
├── nested.svelte        # Child component with conditional rendering
└── programmatic.svelte  # Programmatic mount test component

packages/svelte/tests/runtime-legacy/samples/mount-vs-template-rendering/
├── _config.js           # Legacy mode test configuration
├── main.svelte          # Template rendering test component
├── nested.svelte        # Child component with conditional rendering
└── programmatic.svelte  # Legacy class component test
```

## 1. Runes Mode Test (Bug Test)

### Test Components

**Component**: `nested.svelte` (shared between both test scenarios)

```svelte
<script>
	import { getContext } from 'svelte';

	const state = getContext('testState');

	let renderCount = 0;
	$: renderCount++; // Track re-renders for debugging
</script>

<!-- First conditional - this is the one that fails in mount mode -->
{#if state.value === true}
	<h1 data-testid="first-conditional">First: {state.value} ({renderCount})</h1>
{/if}

<!-- Second conditional - this works in both modes -->
{#if state.value === true}
	<h2 data-testid="second-conditional">Second: {state.value} ({renderCount})</h2>
{/if}

<!-- Always visible state display for debugging -->
<p data-testid="state-display">Current: {state.value}</p>
```

**Component**: `main.svelte` (template rendering - control test)

```svelte
<script>
	import { setContext } from 'svelte';
	import Nested from './nested.svelte';

	const testState = $state({ value: true });
	setContext('testState', testState);

	// Export for external control
	export { testState };
</script>

<div data-testid="template-container">
	<Nested />
</div>
```

### Runes Mode Test Configuration

**File**: `packages/svelte/tests/runtime-runes/samples/mount-vs-template-rendering/_config.js`

```javascript
import { flushSync, tick } from 'svelte';
import { test } from '../../test';

export default test({
	html: `<div data-testid="template-container"><h1 data-testid="first-conditional">First: true (1)</h1><h2 data-testid="second-conditional">Second: true (1)</h2><p data-testid="state-display">Current: true</p></div>`,

	async test({ assert, target, component }) {
		// Test 1: Template rendering (control test - should work)
		await testTemplateRendering(assert, target, component);

		// Test 2: Programmatic mounting (bug test - should fail before fix)
		await testProgrammaticMounting(assert, target);

		// Test 3: Rapid state changes (stress test)
		await testRapidStateChanges(assert, target, component);
	}
});

async function testTemplateRendering(assert, target, component) {
	const templateContainer = target.querySelector('[data-testid="template-container"]');

	// Verify initial state
	assert.ok(templateContainer.querySelector('[data-testid="first-conditional"]'));
	assert.ok(templateContainer.querySelector('[data-testid="second-conditional"]'));
	assert.equal(
		templateContainer.querySelector('[data-testid="state-display"]').textContent,
		'Current: true'
	);

	// Change state to false
	component.testState.value = false;
	flushSync();

	// Verify both conditionals are hidden
	assert.equal(templateContainer.querySelector('[data-testid="first-conditional"]'), null);
	assert.equal(templateContainer.querySelector('[data-testid="second-conditional"]'), null);
	assert.equal(
		templateContainer.querySelector('[data-testid="state-display"]').textContent,
		'Current: false'
	);

	// Change back to true
	component.testState.value = true;
	flushSync();

	// Verify both conditionals are shown again
	assert.ok(templateContainer.querySelector('[data-testid="first-conditional"]'));
	assert.ok(templateContainer.querySelector('[data-testid="second-conditional"]'));
	assert.equal(
		templateContainer.querySelector('[data-testid="state-display"]').textContent,
		'Current: true'
	);
}

async function testProgrammaticMounting(assert, target) {
	// Clear target and test programmatic mounting
	target.innerHTML = '<div data-testid="mount-test"></div>';
	const mountContainer = target.querySelector('[data-testid="mount-test"]');

	// Simulate the bug scenario from the playground
	const { mount, unmount } = await import('svelte');
	const NestedComponent = (await import('./nested.svelte')).default;

	// Create state outside component context (this triggers the bug)
	const stateProxy = $state({ value: true });

	// Mount component programmatically with context
	const mountedComponent = mount(NestedComponent, {
		target: mountContainer,
		context: new Map([['testState', stateProxy]])
	});

	flushSync();

	// Verify initial state
	assert.ok(mountContainer.querySelector('[data-testid="first-conditional"]'));
	assert.ok(mountContainer.querySelector('[data-testid="second-conditional"]'));
	assert.equal(
		mountContainer.querySelector('[data-testid="state-display"]').textContent,
		'Current: true'
	);

	// Change state to false
	stateProxy.value = false;
	flushSync();

	// THIS IS WHERE THE BUG OCCURS:
	// Before fix: first-conditional still shows "true" (stale)
	// After fix: first-conditional should be hidden
	const firstConditional = mountContainer.querySelector('[data-testid="first-conditional"]');
	const secondConditional = mountContainer.querySelector('[data-testid="second-conditional"]');
	const stateDisplay = mountContainer.querySelector('[data-testid="state-display"]');

	assert.equal(firstConditional, null, 'First conditional should be hidden when state is false');
	assert.equal(secondConditional, null, 'Second conditional should be hidden when state is false');
	assert.equal(stateDisplay.textContent, 'Current: false', 'State display should show false');

	// Change back to true
	stateProxy.value = true;
	flushSync();

	// Verify both conditionals work
	assert.ok(mountContainer.querySelector('[data-testid="first-conditional"]'));
	assert.ok(mountContainer.querySelector('[data-testid="second-conditional"]'));
	assert.equal(
		mountContainer.querySelector('[data-testid="state-display"]').textContent,
		'Current: true'
	);

	// Cleanup
	unmount(mountedComponent);
}

async function testRapidStateChanges(assert, target, component) {
	// Test rapid state changes to ensure no race conditions
	for (let i = 0; i < 5; i++) {
		component.testState.value = !component.testState.value;
		flushSync();

		const shouldShow = component.testState.value;
		const firstConditional = target.querySelector('[data-testid="first-conditional"]');
		const secondConditional = target.querySelector('[data-testid="second-conditional"]');

		if (shouldShow) {
			assert.ok(firstConditional, `Iteration ${i}: First conditional should be visible`);
			assert.ok(secondConditional, `Iteration ${i}: Second conditional should be visible`);
		} else {
			assert.equal(firstConditional, null, `Iteration ${i}: First conditional should be hidden`);
			assert.equal(secondConditional, null, `Iteration ${i}: Second conditional should be hidden`);
		}
	}
}
```

## 2. Legacy Mode Test (Also Bug Test)

### Legacy Mode Components

**Component**: `nested.svelte` (legacy version)

```svelte
<script>
	import { getContext } from 'svelte';

	const state = getContext('testState');

	let renderCount = 0;
	$: renderCount++; // Track re-renders
</script>

<!-- First conditional -->
{#if $state.value === true}
	<h1 data-testid="first-conditional">First: {$state.value} ({renderCount})</h1>
{/if}

<!-- Second conditional -->
{#if $state.value === true}
	<h2 data-testid="second-conditional">Second: {$state.value} ({renderCount})</h2>
{/if}

<!-- State display -->
<p data-testid="state-display">Current: {$state.value}</p>
```

**Component**: `main.svelte` (legacy version)

```svelte
<script>
	import { setContext, writable } from 'svelte';
	import Nested from './nested.svelte';

	const testState = writable({ value: true });
	setContext('testState', testState);

	// Export for external control
	export let stateValue = true;

	// Update store when prop changes
	$: testState.set({ value: stateValue });
</script>

<div data-testid="template-container">
	<Nested />
</div>
```

### Legacy Mode Test Configuration

**File**: `packages/svelte/tests/runtime-legacy/samples/mount-vs-template-rendering/_config.js`

```javascript
import { flushSync } from 'svelte';
import { writable } from 'svelte/store';
import { test } from '../../test';

export default test({
	html: `<div data-testid="template-container"><h1 data-testid="first-conditional">First: true (1)</h1><h2 data-testid="second-conditional">Second: true (1)</h2><p data-testid="state-display">Current: true</p></div>`,

	async test({ assert, target, component }) {
		// Test 1: Template rendering (control test)
		await testTemplateRendering(assert, target, component);

		// Test 2: Legacy class component test (also has the bug)
		await testLegacyClassComponent(assert, target);
	}
});

async function testTemplateRendering(assert, target, component) {
	const templateContainer = target.querySelector('[data-testid="template-container"]');

	// Verify initial state
	assert.ok(templateContainer.querySelector('[data-testid="first-conditional"]'));
	assert.ok(templateContainer.querySelector('[data-testid="second-conditional"]'));

	// Change state to false via prop
	component.stateValue = false;
	flushSync();

	// Verify both conditionals are hidden
	assert.equal(templateContainer.querySelector('[data-testid="first-conditional"]'), null);
	assert.equal(templateContainer.querySelector('[data-testid="second-conditional"]'), null);

	// Change back to true
	component.stateValue = true;
	flushSync();

	// Verify both conditionals are shown again
	assert.ok(templateContainer.querySelector('[data-testid="first-conditional"]'));
	assert.ok(templateContainer.querySelector('[data-testid="second-conditional"]'));
}

async function testLegacyClassComponent(assert, target) {
	// Clear target and test legacy class component pattern
	target.innerHTML = '<div data-testid="legacy-test"></div>';
	const legacyContainer = target.querySelector('[data-testid="legacy-test"]');

	// Simulate legacy component mounting (also has the bug)
	const { createClassComponent } = await import('svelte/legacy');
	const NestedComponent = (await import('./nested.svelte')).default;

	// Create writable store (legacy pattern)
	const testState = writable({ value: true });

	// Create component instance with context
	const instance = createClassComponent({
		component: NestedComponent,
		target: legacyContainer,
		context: new Map([['testState', testState]])
	});

	flushSync();

	// Verify initial state
	assert.ok(legacyContainer.querySelector('[data-testid="first-conditional"]'));
	assert.ok(legacyContainer.querySelector('[data-testid="second-conditional"]'));

	// Change state via store
	testState.set({ value: false });
	flushSync();

	// THIS IS WHERE THE BUG OCCURS IN LEGACY MODE TOO:
	// Before fix: first-conditional still shows "true" (stale)
	// After fix: first-conditional should be hidden
	const firstConditional = legacyContainer.querySelector('[data-testid="first-conditional"]');
	const secondConditional = legacyContainer.querySelector('[data-testid="second-conditional"]');

	assert.equal(firstConditional, null, 'First conditional should be hidden when state is false');
	assert.equal(secondConditional, null, 'Second conditional should be hidden when state is false');

	// Change back to true
	testState.set({ value: true });
	flushSync();

	// Verify both conditionals work
	assert.ok(legacyContainer.querySelector('[data-testid="first-conditional"]'));
	assert.ok(legacyContainer.querySelector('[data-testid="second-conditional"]'));

	// Cleanup
	instance.$destroy();
}
```

## 3. Minimal Reproduction Test (Runes Only)

For focused debugging of the specific bug:

**File**: `packages/svelte/tests/runtime-runes/samples/mount-conditional-rendering/_config.js`

```javascript
import { flushSync } from 'svelte';
import { test } from '../../test';

export default test({
	// Skip SSR for this focused test
	skip_mode: ['ssr'],

	async test({ assert, target }) {
		const { mount, unmount } = await import('svelte');

		// Create the problematic component inline to isolate the bug
		const TestComponent = `
			<script>
				import { getContext } from 'svelte';
				const state = getContext('testState');
			</script>
			
			{#if state.value === true}
				<span data-test="first">visible</span>
			{/if}
			{#if state.value === true}
				<span data-test="second">also-visible</span>
			{/if}
		`;

		// Create state in mount context (triggers bug)
		const testState = $state({ value: true });

		// Mount with context
		const component = mount(TestComponent, {
			target,
			context: new Map([['testState', testState]])
		});

		flushSync();

		// Should show both spans initially
		assert.equal(target.querySelectorAll('span').length, 2);
		assert.ok(target.querySelector('[data-test="first"]'));
		assert.ok(target.querySelector('[data-test="second"]'));

		// Change state to false
		testState.value = false;
		flushSync();

		// Bug: First span remains visible, second span hides correctly
		// Fix: Both spans should be hidden
		const firstSpan = target.querySelector('[data-test="first"]');
		const secondSpan = target.querySelector('[data-test="second"]');

		assert.equal(firstSpan, null, 'First conditional should be hidden');
		assert.equal(secondSpan, null, 'Second conditional should be hidden');
		assert.equal(
			target.querySelectorAll('span').length,
			0,
			'All conditional content should be hidden'
		);

		// Cleanup
		unmount(component);
	}
});
```

## Expected Behavior

### Before Fix (Should Fail)

**Both Modes:**

- ❌ Template rendering test: ✅ Passes
- ❌ Programmatic mounting test: ❌ Fails (first conditional shows stale values)
- ❌ Rapid changes test: ❌ Fails intermittently

### After Fix (Should Pass)

**Both Modes:**

- ✅ All tests pass
- ✅ Both rendering modes behave identically
- ✅ All conditionals update consistently
- ✅ No regressions introduced

## Test Commands

Following Svelte's established patterns:

```bash
# Run runes mode tests
pnpm test runtime-runes -- -t mount-vs-template-rendering

# Run legacy mode tests
pnpm test runtime-legacy -- -t mount-vs-template-rendering

# Run both modes
pnpm test runtime-runes runtime-legacy -- -t mount-vs-template-rendering

# Run in development/watch mode
pnpm test runtime-runes -- -t mount-vs-template-rendering --watch

# Update snapshots if needed
UPDATE_SNAPSHOTS=true pnpm test runtime-runes -- -t mount-vs-template-rendering
```

## Integration with CI

1. Tests follow Svelte's established patterns and will automatically be included
2. Both runtime modes tested to ensure the fix works across all scenarios
3. Uses standard `flushSync()` for synchronous testing
4. Proper cleanup with `unmount()` and `$destroy()` calls
5. No external dependencies beyond Svelte's test framework

## Key Insights from Existing Tests

- **Mode Differences**: Runes use `mount()` + `$state()`, Legacy uses `createClassComponent()` + stores
- **Naming**: Kebab-case directory names following existing patterns
- **Structure**: `main.svelte` + `_config.js` minimal structure
- **Assertions**: Use `assert.htmlEqual()` and `assert.ok()` patterns
- **State Management**: Export test state for external control
- **Cleanup**: Always unmount/destroy programmatically created components
- **Timing**: Use `flushSync()` for immediate updates, `tick()` for async
- **Context Pattern**: Context passed as `new Map([['key', value]])`

## Validation

The test suite should:

1. ✅ **Both Modes**: Fail before applying the fix to `runtime.js:948`
2. ✅ **Both Modes**: Pass after applying the fix: `if (!is_derived || !reaction_sources?.includes(signal))`
3. ✅ Follow Svelte's established testing patterns and conventions
4. ✅ Be maintainable and clearly document the expected behavior
5. ✅ Run quickly as part of the regular test suite
6. ✅ Provide clear failure messages for debugging
7. ✅ Cover both runtime modes comprehensively
8. ✅ Demonstrate the bug affects all Svelte reactivity systems
