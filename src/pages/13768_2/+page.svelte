<script>
	const default_details = {
		country: "",
	};

	$: data = {
		locked: false,
		details: null,
	};
	$: details = data.details ?? default_details;
</script>

<select bind:value={details.country} disabled={data.locked}>
	<option value="1">1</option>
</select>
