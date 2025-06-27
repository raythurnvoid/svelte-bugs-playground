<script>
	let arr = $state([100, 0, 50]);
	$effect(() => {
		arr.sort((a, b) => a - b);
	});

	function addItem() {
		arr.push(Math.round(Math.random() * 100));
	}
</script>

Array:
{#each arr as x, i}
	{#if i},{/if}
	{x}
{/each}
<br />
<button onclick={addItem}>add item</button>
