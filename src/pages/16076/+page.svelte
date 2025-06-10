<script lang="ts">
	import { flushSync, tick } from "svelte";

	let flag = $state(true);
	let boolElText = $state(true);
	let div: HTMLDivElement;

	async function handleClick() {
		flushSync(() => {
			boolElText = !boolElText;
		});

		flag = !flag;

		console.log({ boolElText, flag, html: div.innerHTML });

		debugger;
	}
</script>

<div bind:this={div}>
	<button onclick={handleClick}>switch</button>

	<div>flag : {flag}</div>

	{#if !flag}
		<div>boolElText : {boolElText}</div>
	{/if}
</div>
