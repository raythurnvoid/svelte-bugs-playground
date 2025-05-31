import { setContext, getContext, mount } from 'svelte';
import NestedComponent from './NestedComponent.svelte';

export const contextTest = (target: HTMLElement) => {
	const stateObject = $state({
		showText: true
	});
	mount(NestedComponent, {
		target,
		props: {},
		context: new Map([['stateContext', stateObject]])
	});
	// Add a delay to see if that changes behavior
	setTimeout(() => {
		console.debug('Starting interval');
		setInterval(() => {
			console.debug('Changing state from', stateObject.showText, 'to', !stateObject.showText);
			stateObject.showText = !stateObject.showText;
		}, 1000);
	}, 2000); // 2 second delay
};
