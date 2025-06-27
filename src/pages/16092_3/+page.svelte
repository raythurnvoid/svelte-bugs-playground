<script>
	let arr = $state([100, 0, 50]);
	let splice_type = $state(0);

	$effect(() => {
		debugger;

		if (splice_type) {
			arr.splice(0, 2, 0, 100, 77);
		} else {
			arr.splice(0, 2, 100, 0);
		}
	});

	function execute() {
		if (splice_type === 0) {
			splice_type = 1;
		} else {
			splice_type = 0;
		}
	}
</script>

Array:
{#each arr as x, i}
	{#if i},{/if}
	{x}
{/each}
<br />
<button onclick={execute}>do splice</button>
