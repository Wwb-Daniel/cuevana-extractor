const { createClient } = require("@supabase/supabase-js")

const newUrl = "https://pdvdnjmqgcprwntabvia.supabase.co"
const newKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkdmRuam1xZ2NwcndudGFidmlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NTgwNjIsImV4cCI6MjA5ODEzNDA2Mn0.8qcpYfWH9bwDrEQSKzbYvKOqlYpBQmqNWgykTQBXO60"
const newClient = createClient(newUrl, newKey)

async function main() {
  const { data, error } = await newClient.from("premium_movies").select("*").limit(1)
  console.log("Sample premium movie:", data)
}

main()
