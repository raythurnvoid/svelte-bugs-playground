<script lang="ts">
	import Component from "./Component.svelte";
	import { tick } from "svelte";

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

{#if show}
	{derived2}
	<Component value={derived2 ? 0 : 0} />
{/if}
