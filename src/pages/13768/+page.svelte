<script>
	const default_details = { country: "" };

	/** @type {any} */
	$: data = { locked: false, details: null };

	/** @type {any} */
	let details;
	$: {
		details = guard_infinite_loop() ?? data.details ?? default_details;
	}

	// Guard: if this reactive block runs too often we assume an infinite loop
	let guard_infinite_loop_counter = 0;
	function guard_infinite_loop() {
		guard_infinite_loop_counter++;
		if (guard_infinite_loop_counter > 20) {
			console.log("Infinite loop detected");
			return {};
		}
	}

	function setUS() {
		data = { locked: true, details: { country: "US" } };
	}

	function resetData() {
		data = { locked: false, details: null };
	}

	function setFR() {
		data = { locked: true, details: { country: "FR" } };
	}
</script>

{#if guard_infinite_loop_counter > 20}
	<p>Infinite loop detected</p>
{:else}
	<select bind:value={details.country} disabled={data.locked}>
		<option value="1">1</option>
		<option value="US">US</option>
		<option value="FR">FR</option>
	</select>

	<button id="btn-us" on:click={setUS}>US</button>
	<button id="btn-reset" on:click={resetData}>Reset</button>
	<button id="btn-fr" on:click={setFR}>FR</button>
{/if}
