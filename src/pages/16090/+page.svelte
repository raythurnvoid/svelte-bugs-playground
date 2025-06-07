<script lang="ts">
	import { tick } from "svelte";

	debugger;

	let show = $state(true);
	let data = $state({ value: 0 });
	let override: number | null = $state(null);

	$effect(() => {
		(async () => {
			show = false;
			data = { value: 0 };
			await tick();
			show = true;
			await tick();
			override = 1;
		})();
	});

	let derived1 = $derived(override ?? data.value);
	let derived2 = $derived(derived1);
</script>

{#snippet dummy(value = 0)}{/snippet}

{#if show}
	{derived2}
	{@render dummy(derived2 ? 0 : 0)}
{/if}
