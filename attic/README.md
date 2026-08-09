# attic

`Checker.py` is the program this repository used to be. It is kept, unmodified,
because it is a better teacher than anything written to be a teaching example.

It is 31 lines long. It does what it says. And it is wrong in six distinct
ways, every one of which is still shipping in production somewhere today.

## What it did

Ask for a filename prefix, find matching files in the current directory, read
each one, and send its **entire contents** to `purgomalum.com` as a URL query
parameter. Print `Profanity alert !` if the response contains `true`.

## What is wrong with it

**1. It uploads your document to a stranger.** The one thing a "check this file"
tool must not do. Every byte of every matched file went to a third party, in the
URL, where it lands in access logs. glasstext's entire architecture is a
reaction to this line: the page declares `connect-src 'none'`, so the browser
physically refuses to let it make a network request.

**2. Over plain HTTP.** Not just a stranger — anyone on the path.

**3. The text is never URL-encoded.** Concatenating raw file contents into a URL
means any `&`, `#`, `+` or space silently truncates or corrupts the request. The
program then reports on whatever fragment happened to arrive.

**4. `if "true" in output`.** The response is matched by substring. The string
`true` appears inside the word `truest`, inside `construe`, and inside any error
page containing the word. There is no status-code check, so an HTTP 500 whose
body mentions "true" reads as a profanity alert.

**5. No error handling at all.** No network? Traceback. File is a directory?
Traceback. Binary file? Traceback.

**6. It gives a verdict without evidence.** `Profanity alert !` — which word,
where, why, matched against what list? The user cannot tell whether the tool
found a slur or found the word *class*. This is the deepest failure, and the one
glasstext is organised around fixing.

To that list, add the substrate: it is Python 2 (`raw_input`, `print` statement,
`urllib.urlopen`), which reached end of life in January 2020.

## What replaced it

The [Filter lab](https://www.meherbejaoui.com/glasstext/#filter) does the same job
locally, and instead of a verdict it shows you the trade-off you are actually
making — substring matching versus whole-word matching versus normalise-then-match
— with the false positives and the evasions both counted in front of you.

The relevant reading is in [`src/screening.js`](../src/screening.js) and the
[Scunthorpe section](https://www.meherbejaoui.com/glasstext/learn.html#filters) of
the Learn page.
