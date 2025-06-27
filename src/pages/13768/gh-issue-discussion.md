# GitHub Issue #13768: Broken page with Svelte 5: uncaught `effect_update_depth_exceeded`

**Issue URL:** https://github.com/sveltejs/svelte/issues/13768  
**State:** Open  
**Author:** @probablykasper  
**Created:** October 21, 2024  
**Assignee:** @dummdidumm

## Description

### Describe the bug

Upgrading from Svelte 5 (without making any code changes) resulted in an infinite `effect_update_depth_exceeded` error

### Reproduction

https://svelte.dev/playground/48f838c2c37d447faa909ea9bd50d90f?version=5.1.6

### Logs

> Error: effect_update_depth_exceeded Maximum update depth exceeded. This can happen when a reactive block or effect repeatedly sets a new value. Svelte limits the number of nested updates to prevent infinite loops

### Severity

blocking an upgrade

### Additional Information

_No response_

## Reactions

👍 4 reactions from: knd775, hungndv, ArtskydJ, ilokhov

## Labels

- Bug

## Activity Timeline

**Oct 22, 2024** - Issue transferred from sveltejs/kit by @eltigerchino

## Comments and Responses

### @knd775 commented on Oct 22, 2024

Can confirm. This is also happening to a number of our selects.

### @Travja commented on Oct 23, 2024

Dependabot upgraded our project from 4.2.19 to 5.0.5 and I'm seeing this issue as well.

### @knd775 commented on Oct 23, 2024

It only happens when the component isn't in runes mode.

### @Travja commented on Oct 26, 2024 (edited)

I've been trying to make sure that everything is properly updated to Svelte 5 syntax for runes and everything but am still facing the issue. It's possible that I have more updating to do. My project is fairly complex with a lot of moving parts.

**Edit:** looks like I got things figured out.

### @probablykasper commented on Apr 10

@dummdidumm Hey, wondering if this bug could be looked at (it's blocking me from upgrading to Svelte 5). Not sure if it fell through the cracks

**Apr 10** - @dummdidumm added the Bug label and self-assigned the issue

## Related Pull Requests

**Last week** - @raythurnvoid linked pull request [#16165](https://github.com/sveltejs/svelte/pull/16165) that will close this issue:

- **Title:** "Prevent effect_update_depth_exceeded when using bind:value on a select with deriveds state in legacy components"

## Key Insights from Discussion

- Issue affects `select` elements specifically
- Only occurs in legacy components (not in runes mode)
- Multiple users experiencing the same issue after upgrading from Svelte 4 to 5
- A fix has been proposed in PR #16165

## Status

Currently assigned to @dummdidumm. A pull request (#16165) has been linked that should resolve this issue.
