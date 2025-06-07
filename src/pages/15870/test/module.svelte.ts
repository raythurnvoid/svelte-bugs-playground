import { mount } from 'svelte';
import Nested from './nested.svelte';

export function mountComponentWithContext(target: any) {
	const stateObject = $state({ showText: true });

	mount(Nested, {
		target,
		props: {},
		context: new Map([['stateContext', stateObject]])
	});

	return {
		getShowText: () => stateObject.showText,
		setShowText: (newShowText: any) => {
			stateObject.showText = newShowText;
		}
	};
}
