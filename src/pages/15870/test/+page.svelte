<script lang="ts">
	import { onMount } from 'svelte';
	import { mountComponentWithContext } from './module.svelte.ts';

	let mountTarget: any;

	let getShowText: any;
	let setShowText: any;

	onMount(() => {
		const r = mountComponentWithContext(mountTarget);
		getShowText = r.getShowText;
		setShowText = r.setShowText;
	});

	function toggleState() {
		setShowText(!getShowText());
	}
</script>

<button onclick={() => toggleState()}>toggle</button>
<div bind:this={mountTarget}></div>
