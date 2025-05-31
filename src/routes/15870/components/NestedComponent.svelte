<script>
	import { getContext } from 'svelte';

	const stateObjectFromContext = getContext('stateContext');

	console.debug('NestedComponent executing');

	// $inspect(
	// 	stateObjectFromContext.showText,
	// 	'NestedComponent Effect running: stateObjectFromContext.showText'
	// );
</script>

<p>Following text is inside an 'if' statement and should only ever be able to show 'true'</p>

{#if stateObjectFromContext.showText === true}
	<h1>{stateObjectFromContext.showText}</h1>
{/if}
