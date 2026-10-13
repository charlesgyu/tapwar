const R = RNG.make(42);
const put = (id, grade, floor) => { const it = Items.generate({ id, grade, floor: floor || 3, rng: R }); Inventory.add(G, it); return it; };
const eq = (id, grade, floor) => { const it = put(id, grade, floor); const r = Inventory.equip(G, it.uid); if (!r.ok) console.warn('equip fail', id, r.reason); return it; };
G.player.level = 12;
eq('forest_leaf_hat', 'rare', 5); eq('neck_silver', 'uncommon'); eq('ear_crystal', 'legendary', 8); eq('forest_leaf_body', 'rare', 5);
eq('cloth_belt_1', 'common'); eq('forest_leaf_gloves', 'uncommon'); eq('cloth_boots_2', 'legendary', 9);
eq('ring_silver', 'rare'); eq('ring_copper', 'common'); eq('bag_m', 'uncommon'); eq('wand_moon', 'rare', 6); eq('book_crystal', 'legendary', 9);
put('staff_crystal_two', 'legendary', 9); put('wand_wood', 'common'); put('staff_oak_two', 'uncommon'); put('sword_iron', 'rare'); put('ring_crystal', 'rare', 8); put('cloth_hat_2', 'uncommon', 7);
