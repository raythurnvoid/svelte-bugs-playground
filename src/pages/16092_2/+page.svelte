<script>
	import { untrack } from "svelte";

	let count = $state(0);
	let log = $state([]);

	$effect(() => {
		const v = getValue();
		untrack(() => {
			log.push(v);
		});
	});

	function getValue() {
		return count;
	}

	function inc() {
		count += 1;
	}
</script>

<button onclick={inc}>inc</button>
{#each log as item}
	<p>{item}</p>
{/each}
