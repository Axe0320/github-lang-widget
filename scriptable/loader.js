// Paste this once into a new Scriptable script (e.g. named "GitHub Lang Widget"),
// then add a Home Screen or Lock Screen widget pointing at this script.
//
// This file only fetches the real logic from Vercel and runs it. As long as
// SCRIPT_URL below stays correct, you never need to paste anything again —
// pushing changes to widget-body.js and redeploying to Vercel is enough.

const SCRIPT_URL = "https://github-lang-widget.vercel.app/api/widget-script"

const code = await new Request(SCRIPT_URL).loadString()
eval(code)
