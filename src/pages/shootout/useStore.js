import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const generateInitialRacks = () => {
    const racks = [];
    for (let r = 1; r <= 5; r++) {
        racks.push({
            id: `rack${r}`,
            type: 'NORMAL',
            balls: [
                { id: `r${r}_b1`, points: 1, result: null },
                { id: `r${r}_b2`, points: 1, result: null },
                { id: `r${r}_b3`, points: 1, result: null },
                { id: `r${r}_b4`, points: 1, result: null },
                { id: `r${r}_m5`, points: 2, result: null },
            ]
        });
    }
    // Deep 3 rack
    racks.push({
        id: `deep3`,
        type: 'DEEP3',
        balls: [
            { id: `d3_1`, points: 3, result: null },
            { id: `d3_2`, points: 3, result: null },
        ]
    });
    return racks;
};

const initialPlayers = Array.from({ length: 20 }).map((_, i) => ({
    id: `p${i + 1}`,
    name: `참가자 ${i + 1}`,
    racks: generateInitialRacks(),
    totalScore: 0,
    completed: false,
}));

export const useStore = create(
    persist(
        (set) => ({
            players: initialPlayers,
            updatePlayerOrder: (from, to) =>
                set((state) => {
                    const newPlayers = [...state.players];
                    const [moved] = newPlayers.splice(from, 1);
                    newPlayers.splice(to, 0, moved);
                    return { players: newPlayers };
                }),
            updatePlayerName: (id, name) =>
                set((state) => ({
                    players: state.players.map(p => p.id === id ? { ...p, name } : p)
                })),
            savePlayerResult: (id, racks, totalScore) =>
                set((state) => ({
                    players: state.players.map(p =>
                        p.id === id ? { ...p, racks, totalScore, completed: true } : p
                    )
                })),
            resetAll: () => set({ players: initialPlayers })
        }),
        {
            name: '3pt-shootout-storage',
        }
    )
);
