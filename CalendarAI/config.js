// Init config localstorage here
const aiRequest = localStorage.getItem("calendarai.airequest") || `
Here is a history of meals:
%%RECIPES%%

What should I make on %%DATE%%?
If you can't find a pattern, choose randomly based on what we have on that weekday, with meals we have more often weighted in favor.
Try to not repeat meals that we have had recently.`
const CLIENT_ID = localStorage.getItem("calendarai.CLIENT_ID") || prompt("Please input CLIENT_ID")
localStorage.setItem("calendarai.CLIENT_ID", CLIENT_ID)
const GEMINI_API_KEY = localStorage.getItem("calendarai.GEMINI_API_KEY") || prompt("Please input GEMINI_API_KEY")
localStorage.setItem("calendarai.GEMINI_API_KEY", GEMINI_API_KEY)