<script>
	let s = $state(1);
	let ss = $derived(s * s);

	$effect(() => {
		console.log("hi ss: ", ss);
		return () => {
			console.log("bye ss: ", ss);
		};
	});
</script>

<button onclick={() => s++}>Add s</button>
<button onclick={() => (ss = 7)}>Overwrite ss</button>
<p>s: {s}</p>
<p>ss: {ss}</p>
