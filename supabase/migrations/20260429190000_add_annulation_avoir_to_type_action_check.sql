-- Étend la CHECK constraint sur actions_relance.type_action pour inclure
-- 'annulation_avoir', utilisé comme entrée d'audit auto-générée quand un avoir
-- (NCRE) est annulé depuis l'UI ClientDetail (pendant à 'passage_perte' pour
-- les FACT/NDEB).
ALTER TABLE actions_relance DROP CONSTRAINT actions_relance_type_action_check;
ALTER TABLE actions_relance ADD CONSTRAINT actions_relance_type_action_check
  CHECK (type_action = ANY (ARRAY[
    'email_j7','appel_j15','mise_en_demeure_j30','rappel_dgd',
    'appel_manuel','email_manuel','relance_manuel','courrier_manuel',
    'mise_en_demeure_manuel','autre_manuel',
    'passage_perte','annulation_avoir'
  ]));
