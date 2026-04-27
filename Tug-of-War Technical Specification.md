# **Technical Specification: Tug-of-War Learning Engine**

## **1\. Project Vision**

A real-time, competitive, cross-platform educational game where players compete in a physical "Tug-of-War" by answering subject-specific questions. The system must support asynchronous play (no turn-taking), heterogeneous difficulty levels (Professor vs. Student), and both local and remote connectivity.

## **2\. Core Architecture**

* **Frontend:** Next.js (React) with Tailwind CSS.  
* **Animation Engine:** Framer Motion (for smooth rope physics using layoutId for sliding transitions).  
* **Real-Time Backend:** Supabase (PostgreSQL \+ Realtime).  
* **State Management:** React Context \+ Supabase Realtime Channels.

## **3\. Database Schema (Supabase)**

### **3.1. game\_sessions Table**

| Column | Type | Description |
| :---- | :---- | :---- |
| id | UUID | Unique game identifier. |
| p1\_id | UUID | User ID for Player 1 (Left). |
| p2\_id | UUID | User ID for Player 2 (Right). |
| rope\_pos | Float | Current position (-100 to 100). 0 is center. |
| status | Enum | waiting, active, finished. |
| p1\_config | JSONB | Player 1 settings (Subject, Difficulty, Multiplier). |
| p2\_config | JSONB | Player 2 settings (Subject, Difficulty, Multiplier). |
| room\_code | String | 4-6 character alphanumeric code for joins. |

## **4\. The "Equalizing" Architecture (Professor vs. Student)**

To allow a 12-year-old playing "Simple Math" to play fairly against a Professor playing "Advanced Chemistry," the game utilizes a **Difficulty-Adjusted Impact** system.

### **4.1. Logic & Balancing**

The system stores individual configurations for each player. The impact\_multiplier is the equalizer.

* **Example Config:**  
  * **Player 1 (Student):** { "subject": "Math", "difficulty": "Easy", "impact\_multiplier": 1.0 }  
  * **Player 2 (Professor):** { "subject": "Chemistry", "difficulty": "Hard", "impact\_multiplier": 3.0 }  
* **The Result:** If the Professor takes 3x longer to solve a hard problem, their "tug" is 3x stronger. This ensures that both players pull the rope equally based on their performance relative to their chosen difficulty.

## **5\. The Real-Time "Tug" Engine**

The game is a high-speed arcade experience with **no turn-taking**.

### **5.1. Atomic Updates (The RPC Layer)**

To handle high-frequency write events and prevent race conditions (where rapid-fire answers might overwrite each other), updates must be atomic via PostgreSQL Functions.

CREATE OR REPLACE FUNCTION tug\_rope(game\_id UUID, player\_num INT, impact\_score FLOAT)  
RETURNS VOID AS $$  
BEGIN  
  UPDATE game\_sessions  
  SET rope\_pos \= CASE   
    WHEN player\_num \= 1 THEN rope\_pos \- impact\_score  
    ELSE rope\_pos \+ impact\_score  
  END  
  WHERE id \= game\_id;  
END;  
$$ LANGUAGE plpgsql;

## **6\. UI/UX & Feedback Loops**

Since there is no waiting, the UI must focus on high-velocity feedback.

* **Input Spam Prevention:** Implement a minor visual cooldown (e.g., 200ms) or a "submission animation" to prevent accidental double-taps while maintaining arcade speed.  
* **Visual Indicators:** Use a "trailing animation" for the rope. It should never "jump" to a new position; it should "slide" based on the velocity of correct answers using Framer Motion.  
* **Optimistic UI:** Move the rope locally immediately upon a correct answer, then reconcile with the Supabase rope\_pos state.

## **7\. System Features & Modes**

* **Room-Based (Teacher Mode):** Host creates a room (e.g., code "MATH-X"). Students join and the teacher initiates the start.  
* **Direct Challenge (P2P):** Generates a unique link. The first person to join becomes Player 2\. Both configure their own subject/difficulty before starting.

## **8\. Sprint Breakdown Proposal**

### **Sprint 1: The Physics Engine**

* Build local-only split-screen UI.  
* Implement the impact\_score logic and the impact\_multiplier configuration.  
* Ensure rope movement feels fluid and "heavy."

### **Sprint 2: The Sync Layer**

* Connect Supabase Realtime for cross-device play.  
* Implement the tug\_rope RPC for atomic state updates.  
* Build the "Room/Challenge" logic to initialize game sessions with specific multipliers.

*End of Specification*