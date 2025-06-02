<script>
	import { getContext } from 'svelte';

	const stateObjectFromContext = getContext('stateContext');
</script>

<p>First if block (broken in mount mode):</p>
{#if stateObjectFromContext.showText === true}
	<span class="first">First: {stateObjectFromContext.showText}</span>
{/if}

<p>Second if block (works in mount mode):</p>
{#if stateObjectFromContext.showText === true}
	<span class="second">Second: {stateObjectFromContext.showText}</span>
{/if}
