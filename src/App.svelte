<script lang="ts">
	const issues = [
		{ id: "16114", title: "GitHub Issue #16114" },
		{ id: "16092_3", title: "GitHub Issue #16092_3" },
		{ id: "16092_2", title: "GitHub Issue #16092_2" },
		{ id: "16092", title: "GitHub Issue #16092" },
		{ id: "16134", title: "GitHub Issue #16134" },
		{ id: "13768", title: "GitHub Issue #13768" },
		{ id: "13768_2", title: "GitHub Issue #13768_2" },
		{ id: "16090", title: "GitHub Issue #16090" },
		{ id: "16076", title: "GitHub Issue #16076" },
		{ id: "15870", title: "GitHub Issue #15870" },
	];
</script>

<main>
	{#each issues as issue}
		<li>
			<a href="/src/pages/{issue.id}/">{issue.title}</a>
		</li>
	{/each}
</main>
