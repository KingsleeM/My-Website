async function loadVisitStats() {
    const counter = document.getElementById('visitCounter');
    const location = document.getElementById('visitLocation');

    if (!counter || !location) {
        return;
    }

    const apiUrls = [];
    const origin = window.location.origin;

    if (origin && origin !== 'null') {
        apiUrls.push(origin + '/api/visit');
    }

    apiUrls.push('http://localhost:8000/api/visit', 'http://127.0.0.1:8000/api/visit');

    let lastError = null;

    for (const url of apiUrls) {
        try {
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error('Request failed with status ' + response.status);
            }

            const data = await response.json();
            counter.textContent = 'Visited in the last 24 hours: ' + data.totalVisits + ' unique IP' + (data.totalVisits === 1 ? '' : 's');
            location.textContent = 'Location: ' + (data.location || 'Unavailable');
            return;
        } catch (error) {
            lastError = error;
        }
    }

    counter.textContent = 'Visited in the last 24 hours: unavailable';
    location.textContent = 'Location: unavailable';
}

loadVisitStats();
