
## After the recording - two minutes, do not skip

1. Upload the video as **unlisted** (YouTube) or link-shared (Drive/Loom), check it in a private window, and copy the link.
2. Open `README.md` line 10 and replace `https://youtu.be/REPLACE-WITH-UNLISTED-VIDEO` with the real link. Paste the same link into the HackerRank form, with the *Short description* section from the README as the description.
3. Rebuild the archive so it contains the real link:

```powershell
python run_eval.py package
```


## Checklist before you upload

- [ ] The benchmark finished, `report --sync-readme` filled the README, and `package` built the ZIP
- [ ] Under 5:00 (check the player, not your timer)
- [ ] Audio audible on laptop speakers at 50% volume
- [ ] Terminal text legible at 720p
- [ ] No API key, no `.env`, no shell history showing a secret on screen
- [ ] The video states the problem, shows a task, shows the grader being validated, shows the results, shows one failure in the model's own code, and shows the offline re-run
- [ ] The link opens in a private window without requesting access
- [ ] The same link is in the HackerRank form **and** in the README, and `REPLACE-WITH-UNLISTED-VIDEO` no longer appears anywhere

## If you have to cut something

Cut the mutation paragraph (2:15 to 3:00) to 15 seconds. Never cut the failure close-up at 3:40: it is the part judges remember.
---


# What the judge is scoring while you talk

They score out of 100 across seven criteria. Every one of them has a beat in this script, so keep the mapping in your head:

| Criterion | What earns it | Where it happens |
|---|---|---|
| Real-world relevance (15) | a limitation that matters in practice, not a gotcha | 0:00, the five production failures |
| Task design (20) | clear tasks, defensible answers, edge cases | 1:00, showing the spec and the rule |
| Grader reliability (20) | no false passes, no false fails | 2:15, the wrong solution rejected by exactly four tags |
| Evidence of limitation (15) | several trials, a spread across capability, transcripts | 3:00, three trials each and GPT-4o code that fails |
| Reproducibility (15) | a judge can run it | 4:15, the offline re-run |
| Human expertise (10) | this person knows the domain | 0:00 and 3:40, when you interpret the failure rather than just show it |
| Insight (5) | a lesson, not a score | 4:30, "implements the rule once, misses the second place" |

# Lines that do the work

If you memorise nothing else, memorise these four. Each one is short, specific, and says something the numbers cannot:

1. **"None of that is a puzzle. Each one is a rule."** - kills the "this is a trick benchmark" suspicion before it forms.
2. **"The tests are hidden. The reference solution is hidden."** - tells the judge the model could not have cheated.
3. **"Same file. Same session. Correct rule, applied to half the code."** - the whole thesis in eleven words.
4. **"It implements the rule once, and misses the second place it applies."** - the sentence people will repeat.

# What not to say

- Do not say "the model is dumb" or "models are bad at frontend". You are measuring a specific, explainable gap; overclaiming reads as inexperience and contradicts your own limitations section.
- Do not claim the models failed "because of reasoning" or anything you have not read in their output.
- Do not mention API spend, credits, gateways or which provider you used. It adds nothing and invites questions about access.
- Do not say "I think" before a number. Read the number from the table, or leave it out.
- Do not explain the mutation testing twice. One line, move on.

# If you flub a line

Keep going. Record the whole thing in one take, then re-record only the block that went wrong (0:00, 1:00, 2:15, 3:00, 4:15 are separate blocks for exactly this reason). Cut them together; nobody expects a single unbroken take, and the audio does not need to be studio quality. It needs to be audible and it needs to be under five minutes.

# The one thing that will lose you points

A link that asks for permission. Test it in a private window, logged out, before you paste it anywhere. Everything else in this script is recoverable; that is not.
