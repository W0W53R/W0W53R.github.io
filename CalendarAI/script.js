const SCOPES = 'https://www.googleapis.com/auth/calendar';
const spinner = document.getElementById("spinner")
const ONE_DAY = 86400000

let token = localStorage.getItem("calendarai.token") || null;

let recipeDatabase = null;
(async function() {
    const res = await fetch("recipes.json")
    const db = JSON.parse(await res.text())
    recipeDatabase = db
})()

document.getElementById('authorize_button').onclick = authorize;
document.getElementById('signout_button').onclick = signOut;
document.getElementById("ask_ai").onclick = function() {
    const body = document.getElementById('output')
    body.replaceChildren();
    askAiForDate(new Date(document.getElementById("date_picker").value))
    spinner.style.display = "none"
}
document.getElementById("ask_ai_week").onclick = async function() { 
    const body = document.getElementById('output')
    body.replaceChildren();
    let current_date = (new Date(document.getElementById("date_picker").value)).valueOf()
    for (let i = 0; i < 7; i++) {
        const resp = await askAiForDate(new Date(current_date))

        recipes.push((new Date(current_date)).toISOString().split("T")[0] + ": " + resp)

        current_date += ONE_DAY
    }
    // Clean up
    for (let i = 0; i < 7; i++) {
        recipes.pop()
    }
    spinner.style.display = "none"
}
document.getElementById("add_to_calendar").onclick = function() {
    addToCalendar(lastSuggestion)
}

document.addEventListener("DOMContentLoaded", async function() {
    try {
        const result = await getMenuCalendarId()
        if (!result) {
            return
        }
        // User is authed
        localStorage.setItem("calendarai.token", token)
        document.getElementById('signout_button').style.display = 'block';
        document.getElementById('date_picker').style.display = 'block';
        document.getElementById('date_picker').value = new Date().toISOString().split('T')[0]
        document.getElementById('ask_ai').style.display = 'block';
        document.getElementById('ask_ai_week').style.display = 'block';
        await fetchAndAnalyzeCalendar();
    } catch (err) {
        // Make user auth
    }
    spinner.style.display = "none"

})

function authorize() {
  google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: async (response) => {
      if (response.error) {
        console.error(response);
        return;
      }
      token = response.access_token;
      localStorage.setItem("calendarai.token", token)
      document.getElementById('signout_button').style.display = 'block';
      document.getElementById('date_picker').style.display = 'block';
      document.getElementById('ask_ai').style.display = 'block';
      document.getElementById('ask_ai_week').style.display = 'block';
      await fetchAndAnalyzeCalendar();
    },
  }).requestAccessToken();
}

function signOut() {
  token = null;
  localStorage.setItem("calendarai.token", null)
  location.reload()
}

let recipes;
async function fetchAndAnalyzeCalendar() {
  document.getElementById('output').innerText = 'Fetching calendar list...';

  const calRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${token}` }
  });
  const calList = await calRes.json();

  const menuCal = calList.items.find(c => c.summary === "Menu");

  if (!menuCal) {
    document.getElementById('output').innerText = 'No calendar named "Menu" found.';
    return;
  }

  const timeMin = new Date(Date.now() - 180 * ONE_DAY).toISOString();
  const timeMax = new Date(Date.now() + ONE_DAY).toISOString();

  const eventsRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(menuCal.id)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const eventsData = await eventsRes.json();

  console.log(eventsData)
  
  recipes = (eventsData.items || []).map(event => {
    const date = event.start.date || (event.start.dateTime || '').split("T")[0];
    return `${date}: ${event.summary}`;
  });
  document.getElementById('output').innerText = "Ready";
}

async function getMenuCalendarId() {
  const calRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${token}` }
  });
  const calList = await calRes.json();
  return (calList.items.find(c => c.summary === "Menu") || {}).id;
}


let lastSuggestion = undefined;
async function askAiForDate(date) {
    spinner.style.display = "block"
    document.getElementById("add_to_calendar").style.display = 'none';

    try {
        const today = date.toISOString().split("T")[0];
        const prompt = aiRequest.replace("%%RECIPES%%", recipes.join("\n")).replace("%%DATE%%", today)
        const suggestion = await askGemini(prompt);
        console.log(suggestion)
        lastSuggestion = suggestion.suggestedRecipe

        // WARNING: DOM MANIPULATION AHEAD
        // YOU HAVE BEEN WARNED

        const body = document.getElementById('output')
        // body.replaceChildren(); // DO this somewhere else
        body.append(document.createTextNode(suggestion.textAnswer));
        body.append(document.createElement("br"));
        body.append(document.createElement("br"));

        const radios = []
        const name = crypto.randomUUID()

        // body.append(document.createTextNode("Recipe: " + suggestion.suggestedRecipe));

        const options = [suggestion.suggestedRecipe]
        options.push(...suggestion.runnerUps)
        
        let checkable_radio = null;
        for (let i = 0; i < options.length; i++) {
            const id = crypto.randomUUID() // Chance of overlap: 1 in 2.71 x 10^18
            
            const label = document.createElement("label")
            // label.textContent = "Recipe: " + options[i]

            const radio = document.createElement("input")
            radio.type = "radio"
            radio.name = name
            radio.id = id
            radio.value = options[i]
            if (i == 0) {
                radio.checked = true
                checkable_radio = radio
                label.classList.add("main")
            } else {
                label.classList.add("sub")
            }
            radios.push(radio)
            label.appendChild(radio)
            label.appendChild(document.createTextNode("Recipe: " + options[i]))
            body.appendChild(label)
            body.appendChild(document.createElement("br"))
        }

        const add_to_calendar = document.createElement("button")
        add_to_calendar.textContent = "Add To Calendar"
        add_to_calendar.onclick = async function() {
            let checked = "";
            for (const radio of radios) {
                if (radio.checked) {
                    checked = radio.value
                }
            }
            if (!checked) {
                body.appendChild(document.createTextNode("Couldn't add event: No radio button was selected"))
            }
            const res = await addToCalendar(
                checked,
                new Date(date)
            )
            if (res) {
                body.appendChild(document.createTextNode("Couldn't add event: " + JSON.stringify(res)))
            }
        }
        body.appendChild(add_to_calendar)

        return suggestion.suggestedRecipe
    } catch (err) {
        document.getElementById('output').innerText = "Gemini failed to respond: " + err.toString();
    }
    spinner.style.display = "none"
}

async function askGemini(prompt) {
    const schema = {
        description: "Output",
        type: SchemaType.OBJECT,
        properties: {
            textAnswer: {
                type: SchemaType.STRING,
                description: "Answer to the prompt",
                nullable: false
            },
            suggestedRecipe: {
                type: SchemaType.STRING,
                description: "The name of the suggested recipe",
                nullable: false
            },
            runnerUps: {
                type: SchemaType.ARRAY,
                description: "The list of up to 3 other recipes that could have been the suggested recipe",
                items: {
                    type: SchemaType.STRING,
                    description: "A potential cantidate for the suggested recipe"
                }
            }
        },
        required: ["textAnswer", "suggestedRecipe"]
    }

    const genAI = new window.GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
        }
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return JSON.parse(response.text());
}

async function addToCalendar(name, date) {
    spinner.style.display = "block"
    if (!name) {
        alert("No suggestion to add.");
        return;
    }

    const dateStr = date.toISOString().split("T")[0];
    const menuCal = await getMenuCalendarId();
    if (!menuCal) {
        document.getElementById("output").innerText = 'No calendar named "Menu" found.';
        return;
    }
    let link = "";
    if (recipeDatabase) {
        const base = "https://home-recipes.onrender.com/recipe/"
        const filtered = recipeDatabase.filter((e) => e.name == name)
        if (filtered.length > 0) {
            const recipe = filtered[0]
            link = base + recipe.id
        }
    }

    const event = {
        summary: name,
        start: { date: dateStr },
        end: { date: dateStr }
    };
    if (link) {
        event.source = {
            title: "Recipes DB",
            url: link
        }
        event.description = link
    }

    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(menuCal)}/events`, {
        method: "POST",
        headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
        },
        body: JSON.stringify(event)
    });
    
    spinner.style.display = "none"
    if (res.ok) {
        return false
    } else {
        const err = await res.json();
        return err
    }
};