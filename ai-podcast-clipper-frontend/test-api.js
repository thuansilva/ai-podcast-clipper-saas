fetch("http://localhost:3000/api/youtube/info?url=https://www.youtube.com/watch?v=jNQXAC9IVRw")
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);
