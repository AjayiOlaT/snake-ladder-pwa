import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Initialize Pingram 
const PINGRAM_CLIENT_ID = "o5ophu4m73vc39cnn3tc2oukkr";
const PINGRAM_API_KEY = "pingram_sk_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJrZXlfMjM0MWE3MDc1NjEwNGNlNTRlYTQ0ZWY2NTAyNDk0MTEiLCJ2ZXJzaW9uIjoxLCJhY2NvdW50SWQiOiJvNW9waHU0bTczdmMzOWNubjN0YzJvdWtrciIsImtleVR5cGUiOiJzZWNyZXQiLCJlbnZpcm9ubWVudElkIjoibzVvcGh1NG03M3ZjMzljbm4zdGMyb3Vra3IifQ.Kpl4mXw0UmcXd_vIvz68OQ0F8DHsYKaqfRwLUccem0c";

serve(async (req) => {
  try {
    const payload = await req.json()
    
    // We only care about updates to the game table
    if (payload.type === 'UPDATE' && payload.table === 'games') {
      const oldRecord = payload.old_record;
      const newRecord = payload.record;

      // Ensure the turn has actually changed
      if (newRecord.current_turn_id && newRecord.current_turn_id !== oldRecord.current_turn_id) {
        
        const nextPlayerId = newRecord.current_turn_id;
        console.log(`Notifying player: ${nextPlayerId} for game ${newRecord.id}...`);

        const base64Auth = btoa(`${PINGRAM_CLIENT_ID}:${PINGRAM_API_KEY}`);
        
        // Let Pingram handle the Push Notification
        const pingramRes = await fetch(`https://api.notificationapi.com/${PINGRAM_CLIENT_ID}/sender`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${base64Auth}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              notificationId: 'new_turn', // Note: You'll need to create a template named 'new_turn' in Pingram Dashboard!
              user: {
                id: nextPlayerId 
              },
              mergeTags: {
                game_id: newRecord.id
              }
            })
        });

        if (!pingramRes.ok) {
            const err = await pingramRes.text();
            console.error("Pingram failed:", err);
            return new Response(`Pingram Error: ${err}`, { status: 500 });
        }
        
        return new Response(JSON.stringify({ success: true, notified: nextPlayerId }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    
    return new Response(JSON.stringify({ msg: "Ignored or no turn change" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(String(err?.message ?? err), { status: 500 })
  }
})
