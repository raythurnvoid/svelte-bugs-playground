<script lang="ts">
	import { onMount, setContext } from 'svelte';
	import NestedComponent from './NestedComponent.svelte';
	import { contextTest } from './service.svelte.js';

	const stateObject = $state({
		showText: true
	});

	setContext('stateContext', stateObject);

	let element: HTMLElement;

	onMount(() => {
		// contextTest(element);

		setInterval(() => {
			stateObject.showText = !stateObject.showText;
		}, 1000);
	});
</script>

<div bind:this={element}>
	<NestedComponent />
</div>
