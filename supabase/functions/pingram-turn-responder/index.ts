import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { Pingram } from 'npm:pingram';

const pingram = new Pingram({
  apiKey: 'pingram_sk_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJrZXlfMjM0MWE3MDc1NjEwNGNlNTRlYTQ0ZWY2NTAyNDk0MTEiLCJ2ZXJzaW9uIjoxLCJhY2NvdW50SWQiOiJvNW9waHU0bTczdmMzOWNubjN0YzJvdWtrciIsImtleVR5cGUiOiJzZWNyZXQiLCJlbnZpcm9ubWVudElkIjoibzVvcGh1NG03M3ZjMzljbm4zdGMyb3Vra3IifQ.Kpl4mXw0UmcXd_vIvz68OQ0F8DHsYKaqfRwLUccem0c'
});

serve(async (req) => {
  try {
    const payload = await req.json();

    // We only care about updates to the game table
    if (payload.type === 'UPDATE' && payload.table === 'games') {
      const oldRecord = payload.old_record;
      const newRecord = payload.record;

      // Ensure the turn has actually changed
      if (newRecord.current_turn_id && newRecord.current_turn_id !== oldRecord.current_turn_id) {
        const nextPlayerId = newRecord.current_turn_id;
        const playerPos = nextPlayerId === newRecord.player1_id ? newRecord.player1_pos : newRecord.player2_pos;
        
        console.log(`Notifying player: ${nextPlayerId} for game ${newRecord.id} at pos ${playerPos}...`);

        // Use Pingram SDK to send the notification
        await pingram.send({
          type: 'snake_ladder_push',
          to: {
            id: nextPlayerId 
          },
          parameters: {
            "player_pos": String(playerPos),
            "game_id": newRecord.id
          },
          templateId: 'new_turn'
        });

        return new Response(JSON.stringify({ success: true, notified: nextPlayerId }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ msg: "Ignored or no turn change" }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Pingram failed:", err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
