javascript: (() => {
    async function postUrl() {
        const url = prompt("Paste Magnet Here");
        if (!url) {
            return;
        }

        try {
            const resp = await fetch("https://192.168.1.138:4326/submitMagnet", {
                method: "POST",
                mode: "cors",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    url: url,
                }),
            });

            var msgDiv = document.createElement("div");
            msgDiv.style.position = "fixed",
            msgDiv.style.top = 0;
            msgDiv.style.left = "50%";
            msgDiv.style.color = "black";
            msgDiv.style.padding = "1em";
            msgDiv.id = "__deluge_msg";
            msgDiv.style.transform = "translateX(-50%)";

            if (resp.status !== 200) {
                msgDiv.innerHTML = "Failed to send to Deluge!";
                msgDiv.style.backgroundColor = "pink";
            } else {
                msgDiv.innerHTML = "Magnet added successfully!";
                msgDiv.style.backgroundColor = "lightgreen";
            }
            document.getElementsByTagName("body")[0].append(msgDiv);

            window.setTimeout(() => {
                document.getElementById("__deluge_msg").remove();
            }, 3000);
        } catch (err) {
            alert(err.toString());
        }
    };
    postUrl();
})();
