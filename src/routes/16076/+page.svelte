<script lang="ts">
	import { flushSync } from 'svelte';

	let flag: boolean = $state(true);
	let boolElText = $state(true);

	async function handleClick() {
		flushSync(() => {
			boolElText = !boolElText;
		});

		flag = !flag;
	}
</script>

<button onclick={handleClick}>switch</button>

<div>flag : {flag}</div>

{#if !flag}
	<div>flag : {boolElText}</div>
{/if}
