<script>
	import Component from "./Component.svelte";

	let attr = $state(1);
</script>

<div>
	This variant calls <code>reset()</code> directly inside <code>onerror</code>
	without first correcting the state, demonstrating that the mount-time error bubbles
	past the same boundary.
</div>

<button on:click={() => (attr = 3 - attr)}>
	Toggle attr ({attr})
</button>

<svelte:boundary
	onerror={(_, reset) => {
		// immediately retry without fixing the bad state -> will crash again
		reset();
	}}
>
	<Component {attr} />

	{#snippet failed(error)}
		<p>Error: {error}</p>
	{/snippet}
</svelte:boundary>
