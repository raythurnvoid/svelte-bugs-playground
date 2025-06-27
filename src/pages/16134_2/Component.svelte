<script>
	const { attr } = $props();

	const value = $derived.by(() => {
		if (attr == 2) throw "Hey! That's not allowed!";
		return attr;
	});
</script>

Attr is {value}
