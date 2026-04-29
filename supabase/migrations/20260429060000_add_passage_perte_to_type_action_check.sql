-- Étend la CHECK constraint sur actions_relance.type_action pour inclure
-- 'passage_perte', utilisé comme entrée d'audit auto-générée quand une facture
-- est basculée en perte depuis l'UI ClientDetail.
ALTER TABLE actions_relance DROP CONSTRAINT actions_relance_type_action_check;
ALTER TABLE actions_relance ADD CONSTRAINT actions_relance_type_action_check
  CHECK (type_action = ANY (ARRAY[
    'email_j7','appel_j15','mise_en_demeure_j30','rappel_dgd',
    'appel_manuel','email_manuel','relance_manuel','courrier_manuel',
    'mise_en_demeure_manuel','autre_manuel',
    'passage_perte'
  ]));
