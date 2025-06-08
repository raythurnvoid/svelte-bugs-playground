<script lang="ts">
	import { flushSync, tick } from "svelte";

	let show = $state(true);
	let data = $state({ value: 0 });
	let override: number | null = $state(null);

	let derived1 = $derived(override ?? data.value);
	let derived2 = $derived(derived1);

	debugger;

	$effect(() => {
		(async () => {
			// debugger;
			// override = 3;
			// await tick();
			debugger;
			show = false;
			data = { value: 0 };
			await tick();
			debugger;
			show = true;
			await tick();
			debugger;
			override = 1;
			await tick();
			debugger;
			override = 2;
		})();
	});
</script>

{#snippet dummy(value = 0)}{/snippet}

{#if show}
	<!-- {@debug derived2} -->
	{derived2}
	{@render dummy(derived2 ? 0 : 0)}
{/if}
