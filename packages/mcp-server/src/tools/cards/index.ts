import type { BrightyTool } from "../tool.js";

import { freezeCard } from "./freeze-card.js";
import { getCard } from "./get-card.js";
import { getVirtualCardProduct } from "./get-virtual-card-product.js";
import { listCardDesigns } from "./list-card-designs.js";
import { listCards } from "./list-cards.js";
import { orderCard } from "./order-card.js";
import { setCardLimits } from "./set-card-limits.js";
import { unfreezeCard } from "./unfreeze-card.js";

export {
  freezeCard,
  getCard,
  getVirtualCardProduct,
  listCardDesigns,
  listCards,
  orderCard,
  setCardLimits,
  unfreezeCard,
};

export const cardsTools: BrightyTool[] = [
  listCards,
  getCard,
  orderCard,
  freezeCard,
  unfreezeCard,
  setCardLimits,
  listCardDesigns,
  getVirtualCardProduct,
];
