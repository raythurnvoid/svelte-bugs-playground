<script lang="ts">
	const issues = [
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
