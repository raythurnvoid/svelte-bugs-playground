<script>
	class Foo {
		value = $state(0);
		double = 0;

		constructor() {
			console.log(this.value, this.double);
		}

		increment() {
			this.value++;
		}
	}

	let foo = $state();

	$effect(() => {
		console.debug('effect running');
		foo = new Foo();
	});
</script>

<button onclick={() => foo.increment()}>increment</button>

{#if foo}
	<p>{foo.value}/{foo.double}</p>
{/if}
