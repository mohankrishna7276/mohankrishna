from flask import Flask, render_template, request, jsonify
import datetime

app = Flask(__name__)

# In-memory storage (replace with DB for production)
issues = []
issue_counter = 1

@app.route("/")
def index():
    return render_template("index.html")

# Create or list issues
@app.route("/api/issues", methods=["GET", "POST"])
def api_issues():
    global issue_counter

    if request.method == "POST":
        data = request.get_json() or {}
        lat = data.get("lat", 0) or 0
        lng = data.get("lng", 0) or 0
        issue = {
            "id": issue_counter,
            "title": data.get("title", ""),
            "description": data.get("description", ""),
            "status": "Reported",
            "lat": float(lat),
            "lng": float(lng),
            "photo": data.get("photo", ""),
            "date": datetime.datetime.now().strftime("%Y-%m-%d"),
            "history": [f"{datetime.datetime.now().strftime('%Y-%m-%d %H:%M')} - Reported"]
        }
        issues.append(issue)
        issue_counter += 1
        return jsonify({"message": "Issue created", "issue": issue}), 201

    # GET with filtering
    status = request.args.get("status", "All")
    date_filter = request.args.get("date", "All")
    search = (request.args.get("search", "") or "").lower()

    filtered = issues.copy()
    if status != "All":
        filtered = [i for i in filtered if i["status"] == status]
    if search:
        filtered = [i for i in filtered if search in (i["title"].lower() + " " + i["description"].lower())]
    if date_filter != "All":
        try:
            days = int(date_filter)
            cutoff = datetime.datetime.now() - datetime.timedelta(days=days)
            filtered = [i for i in filtered if datetime.datetime.strptime(i["date"], "%Y-%m-%d") >= cutoff]
        except:
            pass

    return jsonify(filtered)

# Update issue (status updates, etc.)
@app.route("/api/issues/<int:issue_id>", methods=["PATCH"])
def update_issue(issue_id):
    data = request.get_json() or {}
    issue = next((i for i in issues if i["id"] == issue_id), None)
    if not issue:
        return jsonify({"error": "Issue not found"}), 404

    if "status" in data:
        new_status = data["status"]
        issue["status"] = new_status
        issue["history"].append(f"{datetime.datetime.now().strftime('%Y-%m-%d %H:%M')} - {new_status}")

    return jsonify(issue)

if __name__ == "__main__":
    app.run(debug=True)
