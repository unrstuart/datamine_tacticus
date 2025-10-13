#include <sys/stat.h>

#include <cstdio>
#include <fstream>

#include "absl/log/log.h"
#include "absl/status/status.h"
#include "absl/strings/ascii.h"
#include "absl/strings/str_cat.h"
#include "absl/strings/string_view.h"
#include "miner.pb.h"

namespace dataminer {

namespace {

// This mapping comes from
// https://docs.google.com/spreadsheets/d/1uzpWyXbZP7Uh2NTJmfOJP9AYV1PbV-1tqhRa1jjTpFI/edit?gid=0#gid=0
const std::map<std::string, std::string> kIdToSprite = {
    {"adeptCanoness", "adept_canoness_01"},
    {"adeptCelestine", "adept_celestine_01"},
    {"adeptExorcist", "adept_exorcist_01"},
    {"adeptHospitaller", "adept_hospitaller_01"},
    {"adeptMorvenn", "adept_morvenn_01"},
    {"adeptRetributor", "adept_retributor_01"},
    {"admecDestroyer", "admec_destroyer_01"},
    {"admecDominus", "admec_dominus_01"},
    {"admecManipulus", "admec_manipulus_01"},
    {"admecMarshall", "admec_marshall_01"},
    {"admecRuststalker", "admec_ruststalker_01"},
    {"astraBullgryn", "astra_bullgryn_01"},
    {"astraCreed", "astra_creed_01"},
    {"astraDreir", "astra_dreir_01"},
    {"astraOrdnance", "astra_ordnance_01"},
    {"astraOrdnanceBattery", "astra_ordnancebattery_01"},
    {"astraPrimarisPsy", "astra_psyker_01"},
    {"astraYarrick", "astra_yarrick_01"},
    {"blackAbaddon", "black_abaddon_01"},
    {"blackForgefiend", "black_forgefiend_01"},
    {"blackHaarken", "black_haarken_01"},
    {"blackObliterator", "black_obliterator_01"},
    {"blackPossession", "black_possession_01"},
    {"blackTerminator", "black_terminator_01"},
    {"bloodDante", "blood_dante_01"},
    {"bloodDeathCompany", "blood_deathcompany_01"},
    {"bloodIntercessor", "blood_intercessor_01"},
    {"bloodMephiston", "blood_mephiston_01"},
    {"bloodSanguinary", "blood_sanguinary_01"},
    {"custoAtlacoya", "custo_atlacoya_01"},
    {"custoBladeChampion", "custo_bladechampion_01"},
    {"custoTrajann", "custo_trajann_01"},
    {"custoVexilusPraetor", "custo_vexilus_01"},
    {"darkaAsmodai", "darka_asmodai_01"},
    {"darkaAzrael", "darka_azrael_01"},
    {"darkaCompanion", "darka_companion_01"},
    {"darkaHellblaster", "darka_hellblaster_01"},
    {"darkaTerminator", "darka_terminator_01"},
    {"deathBlightbringer", "death_blightbringer_01"},
    {"deathBlightlord", "death_blightlord_01"},
    {"deathCrawler", "death_crawler_01"},
    {"deathPutrifier", "death_putrifier_01"},
    {"deathRotbone", "death_rotbone_01"},
    {"deathTyphus", "death_typhus_01"},
    {"eldarAutarch", "aelda_autarch_01"},
    {"eldarFarseer", "aelda_farseer_01"},
    {"eldarJainZar", "aelda_jainzar_01"},
    {"eldarMauganRa", "aelda_maugan_01"},
    {"eldarRanger", "aelda_ranger_01"},
    {"emperKakophonist", "emper_kakophonist_01"},
    {"emperLucius", "emper_lucius_01"},
    {"emperNoiseMarine", "emper_noisemarine_01"},
    {"genesBiophagus", "genes_biophagus_01"},
    {"genesKelermorph", "genes_kelermorph_01"},
    {"genesMagus", "genes_magus_01"},
    {"genesPatriarch", "genes_patriarch_01"},
    {"genesPrimus", "genes_primus_01"},
    {"necroDestroyer", "necro_hexmark_01"},
    {"necroOverlord", "necro_overlord_01"},
    {"necroPlasmancer", "necro_plasmancer_01"},
    {"necroSpyder", "necro_spyder_01"},
    {"necroWarden", "necro_warden_01"},
    {"orksBigMek", "orkss_mek_01"},
    {"orksKillaKan", "orkss_killakan_01"},
    {"orksNob", "orkss_nob_01"},
    {"orksRukkatrukk", "orkss_rukkatruk_01"},
    {"orksRuntherd", "orkss_runtherd_01"},
    {"orksWarboss", "orkss_warboss_01"},
    {"orksWarboss_Orkz", "orkss_warboss_01"},
    {"orksWarboss_Orkz_LHE", "orkss_warboss_01"},
    {"spaceApothecary", "space_apothecary_01"},
    {"spaceCalgar", "space_calgar_01"},
    {"spaceDreadnought", "space_dreadnought_01"},
    {"spaceEliminatorSgt", "space_eliminator_01"},
    {"spaceInceptorSgt", "space_inceptor_01"},
    {"spaceLibrarian", "space_librarian_01"},
    {"spaceLuther", "space_luther_01"},
    {"spaceBlackmane", "space_ragnar_01"},
    {"spaceHound", "space_hound_01"},
    {"spaceRockfist", "space_arjac_01"},
    {"spaceStormcaller", "space_njal_01"},
    {"spaceWulfen", "space_wulfen_01"},
    {"tauAunShi", "tauta_aunshi_01"},
    {"tauBroadside", "tauta_broadside_01"},
    {"tauCrisis", "tauta_crisis_01"},
    {"tauDarkstrider", "tauta_darkstrider_01"},
    {"tauMarksman", "tauta_marksman_01"},
    {"tauShadowsun", "tauta_shadowsun_01"},
    {"templAggressor", "templ_aggressor_01"},
    {"templAncient", "templ_ancient_01"},
    {"templChampion", "templ_champion_01"},
    {"templHelbrecht", "templ_helbrecht_01"},
    {"templSwordBrother", "templ_brother_01"},
    {"thousAhriman", "thous_ahriman_01"},
    {"thousInfernalMaster", "thous_infernal_01"},
    {"thousSorcerer", "thous_sorcerer_01"},
    {"thousTerminator", "thous_terminator_01"},
    {"thousTzaangor", "thous_tzaangor_01"},
    {"tyranBiovore", "tyran_biovore_01"},
    {"tyranDeathleaper", "tyran_deathleaper_01"},
    {"tyranNeurothrope", "tyran_neurothrope_01"},
    {"tyranParasite", "tyran_parasite_01"},
    {"tyranTyrantGuard", "tyran_tyrantguard_01"},
    {"tyranWingedPrime", "tyran_wingedprime_01"},
    {"ultraApothecary", "ultra_apothecary_01"},
    {"ultraCalgar", "ultra_calgar_01"},
    {"ultraDreadnought", "ultra_dreadnought_01"},
    {"ultraEliminatorSgt", "ultra_eliminator_01"},
    {"ultraInceptorSgt", "ultra_inceptor_01"},
    {"ultraTigurius", "ultra_tigurius_01"},
    {"ultraTitus", "ultra_titus_01"},
    {"worldEightbound", "world_eightbound_01"},
    {"worldExecutions", "world_executions_01"},
    {"worldJakhal", "world_jakhal_01"},
    {"worldKharn", "world_kharn_01"},
    {"worldTerminator", "world_terminator_01"},
    {"orksRedGobbo", "orkss_redgobbo_01"},
    {"adeptBossCanoness", "adept_canoness_01"},
    {"adeptBossCanonessLHE", "adept_canoness_01"},
    {"adeptBossCelestine", "adept_celestine_01"},
    {"adeptBossCelestineLHE", "adept_celestine_01"},
    {"adeptBossHospitaller", "adept_hospitaller_01"},
    {"adeptBossHospitallerLHE", "adept_hospitaller_01"},
    {"adeptBossMorvenn", "adept_morvenn_01"},
    {"adeptBossMorvennLHE", "adept_morvenn_01"},
    {"adeptBossRetributor", "adept_retributor_01"},
    {"adeptBossRetributorLHE", "adept_retributor_01"},
    {"admecBossBelisarius", "guild_belisarius_01"},
    {"admecBossDestroyer", "admec_destroyer_01"},
    {"admecBossDestroyerCE", "admec_destroyer_01"},
    {"admecBossDestroyerLHE", "admec_destroyer_01"},
    {"admecBossDestroyerSurv", "admec_destroyer_01"},
    {"admecBossDominus", "admec_dominus_01"},
    {"admecBossDominusCE", "admec_dominus_01"},
    {"admecBossDominusLHE", "admec_dominus_01"},
    {"admecBossDominusSurv", "admec_dominus_01"},
    {"admecBossManipulus", "admec_manipulus_01"},
    {"admecBossManipulusCE", "admec_manipulus_01"},
    {"admecBossManipulusLHE", "admec_manipulus_01"},
    {"admecBossManipulusSurv", "admec_manipulus_01"},
    {"admecBossMarshall", "admec_marshall_01"},
    {"admecBossMarshallCE", "admec_marshall_01"},
    {"admecBossMarshallLHE", "admec_marshall_01"},
    {"admecBossMarshallSurv", "admec_marshall_01"},
    {"admecBossRuststalker", "admec_ruststalker_01"},
    {"admecBossRuststalkerCE", "admec_ruststalker_01"},
    {"admecBossRuststalkerLHE", "admec_ruststalker_01"},
    {"admecBossRuststalkerSurv", "admec_ruststalker_01"},
    {"astraBossBullgryn", "astra_bullgryn_01"},
    {"astraBossBullgrynLEG", "astra_bullgryn_01"},
    {"astraBossBullgrynLHE", "astra_bullgryn_01"},
    {"astraBossCreed", "astra_creed_01"},
    {"astraBossCreedLEG", "astra_creed_01"},
    {"astraBossCreedLHE", "astra_creed_01"},
    {"astraBossCreedSurv", "astra_creed_01"},
    {"astraBossOrdnance", "astra_ordnance_01"},
    {"astraBossOrdnanceLEG", "astra_ordnance_01"},
    {"astraBossOrdnanceLHE", "astra_ordnance_01"},
    {"astraBossPrimarisPsy", "astra_psyker_01"},
    {"astraBossPrimarisPsyLHE", "astra_psyker_01"},
    {"astraBossPrimarisPsySurv", "astra_psyker_01"},
    {"astraBossYarrick", "astra_yarrick_01"},
    {"astraBossYarrickLEG", "astra_yarrick_01"},
    {"astraBossYarrickLHE", "astra_yarrick_01"},
    {"astraBossYarrickSurv", "astra_yarrick_01"},
    {"blackBossAbaddon", "black_abaddon_01"},
    {"blackBossAbaddonCamp", "black_abaddon_01"},
    {"blackBossAbaddonLEG", "black_abaddon_01"},
    {"blackBossAbaddonLHE", "black_abaddon_01"},
    {"blackBossHaarken", "black_haarken_01"},
    {"blackBossHaarkenCamp", "black_haarken_01"},
    {"blackBossHaarkenLEG", "black_haarken_01"},
    {"blackBossHaarkenLHE", "black_haarken_01"},
    {"blackBossObliterator", "black_obliterator_01"},
    {"blackBossObliteratorCamp", "black_obliterator_01"},
    {"blackBossObliteratorLEG", "black_obliterator_01"},
    {"blackBossObliteratorLHE", "black_obliterator_01"},
    {"blackBossPossession", "black_possession_01"},
    {"blackBossPossessionLEG", "black_possession_01"},
    {"blackBossPossessionLHE", "black_possession_01"},
    {"blackBossTerminator", "black_terminator_01"},
    {"blackBossTerminatorLEG", "black_terminator_01"},
    {"blackBossTerminatorLHE", "black_terminator_01"},
    {"blackHaarken_LHE", "black_haarken_01"},
    {"custoBladeChampion_LHE", "custo_bladechampion_01"},
    {"deathBossBlightbringer", "death_blightbringer_01"},
    {"deathBossBlightbringerLHE", "death_blightbringer_01"},
    {"deathBossBlightlord", "death_blightlord_01"},
    {"deathBossBlightlordLHE", "death_blightlord_01"},
    {"deathBossPutrifier", "death_putrifier_01"},
    {"deathBossPutrifierLHE", "death_putrifier_01"},
    {"deathBossRotbone", "death_rotbone_01"},
    {"deathBossRotboneLHE", "death_rotbone_01"},
    {"deathBossTyphus", "death_typhus_01"},
    {"deathBossTyphusLEG", "death_typhus_01"},
    {"deathBossTyphusLHE", "death_typhus_01"},
    {"eldarBossAutarch", "aelda_autarch_01"},
    {"eldarBossAutarchCamp", "aelda_autarch_01"},
    {"eldarBossAutarchLHE", "aelda_autarch_01"},
    {"eldarBossFarseer", "aelda_farseer_01"},
    {"eldarBossFarseerCamp", "aelda_farseer_01"},
    {"eldarBossFarseerLEG", "aelda_farseer_01"},
    {"eldarBossFarseerLHE", "aelda_farseer_01"},
    {"eldarBossFarseerSurv", "aelda_farseer_01"},
    {"eldarBossJainZar", "aelda_jainzar_01"},
    {"eldarBossJainZarCamp", "aelda_jainzar_01"},
    {"eldarBossJainZarLEG", "aelda_jainzar_01"},
    {"eldarBossJainZarLHE", "aelda_jainzar_01"},
    {"eldarBossMauganRa", "aelda_maugan_01"},
    {"eldarBossMauganRaCamp", "aelda_maugan_01"},
    {"eldarBossMauganRaLEG", "aelda_maugan_01"},
    {"eldarBossMauganRaLHE", "aelda_maugan_01"},
    {"eldarBossMauganRaUltra", "aelda_maugan_01"},
    {"eldarBossRanger", "aelda_ranger_01"},
    {"eldarBossRangerCamp", "aelda_ranger_01"},
    {"eldarBossRangerLHE", "aelda_ranger_01"},
    {"emperKakophonist_LHE", "emper_kakophonist_01"},
    {"emperNoiseMarine_LHE", "emper_noisemarine_01"},
    {"genesBossBiophagus", "genes_biophagus_01"},
    {"genesBossBiophagusLHE", "genes_biophagus_01"},
    {"genesBossKelermorph", "genes_kelermorph_01"},
    {"genesBossKelermorphLHE", "genes_kelermorph_01"},
    {"genesBossMagus", "genes_magus_01"},
    {"genesBossMagusLHE", "genes_magus_01"},
    {"genesBossPatriarch", "genes_patriarch_01"},
    {"genesBossPatriarchLHE", "genes_patriarch_01"},
    {"genesBossPrimus", "genes_primus_01"},
    {"genesBossPrimusLHE", "genes_primus_01"},
    {"guildBossAvatar", "guild_avatar_01"},
    {"guildBossGhazghkull", "guild_ghazghkull_01"},
    {"guildBossMagnus", "guild_magnus_01"},
    {"guildBossMortarion", "guild_mortarion_01"},
    {"guildBossRogalDorn", "guild_rogaldorn_01"},
    {"guildBossScreamerKiller", "guild_screamerkiller_01"},
    {"guildBossTervigon", "guild_tervigon_01"},
    {"necroBossDestroyer", "necro_hexmark_01"},
    {"necroBossDestroyerLEG", "necro_hexmark_01"},
    {"necroBossDestroyerLHE", "necro_hexmark_01"},
    {"necroBossOverlord", "necro_overlord_01"},
    {"necroBossOverlordLEG", "necro_overlord_01"},
    {"necroBossOverlordLHE", "necro_overlord_01"},
    {"necroBossPlasmancer", "necro_plasmancer_01"},
    {"necroBossPlasmancerLEG", "necro_plasmancer_01"},
    {"necroBossPlasmancerLHE", "necro_plasmancer_01"},
    {"necroBossSpyder", "necro_spyder_01"},
    {"necroBossSpyderLEG", "necro_spyder_01"},
    {"necroBossSpyderLHE", "necro_spyder_01"},
    {"necroBossWarden", "necro_warden_01"},
    {"necroBossWardenLEG", "necro_warden_01"},
    {"necroBossWardenLHE", "necro_warden_01"},
    {"orksBossBigMek", "orkss_mek_01"},
    {"orksBossBigMekLHE", "orkss_mek_01"},
    {"orksBossKillaKan", "orkss_killakan_01"},
    {"orksBossKillaKanLHE", "orkss_killakan_01"},
    {"orksBossNob", "orkss_nob_01"},
    {"orksBossNobLHE", "orkss_nob_01"},
    {"orksBossRuntherd", "orkss_runtherd_01"},
    {"orksBossRuntherdLHE", "orkss_runtherd_01"},
    {"orksBossWarboss", "orkss_warboss_01"},
    {"orksBossWarbossLHE", "orkss_warboss_01"},
    {"tauBossAunShi", "tauta_aunshi_01"},
    {"tauBossAunShiLHE", "tauta_aunshi_01"},
    {"tauBossCrisis", "tauta_crisis_01"},
    {"tauBossCrisisInc", "tauta_crisis_01"},
    {"tauBossCrisisLHE", "tauta_crisis_01"},
    {"tauBossDarkstrider", "tauta_darkstrider_01"},
    {"tauBossDarkstriderInc", "tauta_darkstrider_01"},
    {"tauBossDarkstriderLHE", "tauta_darkstrider_01"},
    {"tauBossMarksman", "tauta_marksman_01"},
    {"tauBossMarksmanInc", "tauta_marksman_01"},
    {"tauBossMarksmanLHE", "tauta_marksman_01"},
    {"tauBossRiptide", "guild_riptide_01"},
    {"tauBossShadowsun", "tauta_shadowsun_01"},
    {"tauBossShadowsunLHE", "tauta_shadowsun_01"},
    {"templBossAggressor", "templ_aggressor_01"},
    {"templBossAggressorCamp", "templ_aggressor_01"},
    {"templBossAggressor_LHE", "templ_aggressor_01"},
    {"templBossAncient", "templ_ancient_01"},
    {"templBossAncientCamp", "templ_ancient_01"},
    {"templBossAncient_LHE", "templ_ancient_01"},
    {"templBossChampion", "templ_champion_01"},
    {"templBossChampionCamp", "templ_champion_01"},
    {"templBossChampion_LHE", "templ_champion_01"},
    {"templBossHelbrecht", "templ_helbrecht_01"},
    {"templBossHelbrecht_LHE", "templ_helbrecht_01"},
    {"templBossSwordBrother", "templ_brother_01"},
    {"templBossSwordBrotherCamp", "templ_brother_01"},
    {"templBossSwordBrother_LHE", "templ_brother_01"},
    {"thousBossAhriman", "thous_ahriman_01"},
    {"thousBossAhrimanCamp", "thous_ahriman_01"},
    {"thousBossAhrimanLHE", "thous_ahriman_01"},
    {"thousBossInfernalMaster", "thous_infernal_01"},
    {"thousBossInfernalMasterCamp", "thous_infernal_01"},
    {"thousBossInfernalMasterLHE", "thous_infernal_01"},
    {"thousBossSorcerer", "thous_sorcerer_01"},
    {"thousBossSorcererCamp", "thous_sorcerer_01"},
    {"thousBossSorcererLHE", "thous_sorcerer_01"},
    {"thousBossTerminator", "thous_terminator_01"},
    {"thousBossTerminatorCamp", "thous_terminator_01"},
    {"thousBossTerminatorLHE", "thous_terminator_01"},
    {"thousBossTzaangor", "thous_tzaangor_01"},
    {"thousBossTzaangorCamp", "thous_tzaangor_01"},
    {"thousBossTzaangorLHE", "thous_tzaangor_01"},
    {"tyranBossDeathleaper", "tyran_deathleaper_01"},
    {"tyranBossDeathleaperCE", "tyran_deathleaper_01"},
    {"tyranBossDeathleaperLHE", "tyran_deathleaper_01"},
    {"tyranBossHiveTyrantLeviathan", "guild_tyrant_01"},
    {"tyranBossNeurothrope", "tyran_neurothrope_01"},
    {"tyranBossNeurothropeCE", "tyran_neurothrope_01"},
    {"tyranBossNeurothropeLHE", "tyran_neurothrope_01"},
    {"tyranBossParasite", "tyran_parasite_01"},
    {"tyranBossParasiteCE", "tyran_parasite_01"},
    {"tyranBossParasiteLHE", "tyran_parasite_01"},
    {"tyranBossTyrantGuard", "tyran_tyrantguard_01"},
    {"tyranBossTyrantGuardCE", "tyran_tyrantguard_01"},
    {"tyranBossTyrantGuardLHE", "tyran_tyrantguard_01"},
    {"tyranBossWingedPrime", "tyran_wingedprime_01"},
    {"tyranBossWingedPrimeCE", "tyran_wingedprime_01"},
    {"tyranBossWingedPrimeLEG", "tyran_wingedprime_01"},
    {"tyranBossWingedPrimeLHE", "tyran_wingedprime_01"},
    {"ultraBossApothecary", "ultra_apothecary_01"},
    {"ultraBossApothecaryLHE", "ultra_apothecary_01"},
    {"ultraBossCalgar", "ultra_calgar_01"},
    {"ultraBossCalgarLHE", "ultra_calgar_01"},
    {"ultraBossEliminatorSgt", "ultra_eliminator_01"},
    {"ultraBossEliminatorSgtCamp", "ultra_eliminator_01"},
    {"ultraBossEliminatorSgtLHE", "ultra_eliminator_01"},
    {"ultraBossInceptorSgt", "ultra_inceptor_01"},
    {"ultraBossInceptorSgtLHE", "ultra_inceptor_01"},
    {"ultraBossTigurius", "ultra_tigurius_01"},
    {"ultraBossTiguriusLHE", "ultra_tigurius_01"},
    {"ultraBossTitus", "ultra_titus_01"},
    {"ultraBossTitusLHE", "ultra_titus_01"},
    {"adeptNpc1BattleSister", "adept_battlesister_01"},
    {"adeptNpc2Zephyrim", "adept_zephyrim_01"},
    {"adeptNpcCanoness", "adept_canoness_01"},
    {"adeptNpcCelestine", "adept_celestine_01"},
    {"adeptNpcHospitaller", "adept_hospitaller_01"},
    {"adeptNpcMoWExorcist", "adept_exorcist_01"},
    {"adeptNpcMorvenn", "adept_morvenn_01"},
    {"adeptNpcRetributor", "adept_retributor_01"},
    {"admecNpc1Vanguard", "admec_vanguard_01"},
    {"admecNpc1VanguardSurv", "admec_vanguard_01"},
    {"admecNpc2Techpriest", "admec_techpriest_01"},
    {"admecNpc3Electropriest", "admec_electropriest_01"},
    {"admecNpc3ElectropriestSurv", "admec_electropriest_01"},
    {"astraNpc1Guardsman", "astra_npc_01"},
    {"astraNpc2Lascannon", "astra_npc_02"},
    {"astraNpc3Voxcaster", "astra_npc_03"},
    {"astraNpc4Mortar", "astra_mortar_01"},
    {"astraNpc5DeathRider", "astra_deathrider_01"},
    {"astraNpcMowOrdnanceBattery", "astra_ordnancebattery_01"},
    {"blackNpc1Bloodletter", "black_bloodletter_01"},
    {"blackNpc2Terminator", "black_terminator_01"},
    {"blackNpc3TraitorGuardsman", "black_guardsman_01"},
    {"blackNpc4Havoc", "black_havoc_01"},
    {"blackNpcAbaddon", "black_abaddon_01"},
    {"blackNpcHaarken", "black_haarken_01"},
    {"blackNpcMowForgefiend", "black_forgefiend_01"},
    {"blackNpcObliterator", "black_obliterator_01"},
    {"blackNpcTerminator", "black_terminator_01"},
    {"bloodNpc1Intercessor", "blood_intercessor_01"},
    {"deathNpc1Poxwalker", "death_poxwalker_01"},
    {"deathNpc2PlagueMarine", "death_plaguemarine_01"},
    {"deathNpcBlightbringer", "death_blightbringer_01"},
    {"deathNpcBlightlord", "death_blightlord_01"},
    {"deathNpcMoWCrawler", "death_crawler_01"},
    {"deathNpcPutrifier", "death_putrifier_01"},
    {"deathNpcRotbone", "death_rotbone_01"},
    {"deathNpcTyphus", "death_typhus_01"},
    {"eldarNpc1Guardian", "aelda_guardian_01"},
    {"eldarNpc2Warlock", "aelda_warlock_01"},
    {"eldarNpc3Harlequin", "aelda_harlequin_01"},
    {"eldarNpc4Wraithguard", "aelda_wraithguard_01"},
    {"eldarNpc4WraithguardSurv", "aelda_wraithguard_01"},
    {"genesNpc1Aberrant", "genes_aberrant_01"},
    {"genesNpc2Genestealer", "genes_genestealer_01"},
    {"genesNpc3Neophyte", "genes_neophyte_01"},
    {"genesNpcBiophagus", "genes_biophagus_01"},
    {"genesNpcKelermorph", "genes_kelermorph_01"},
    {"genesNpcMagus", "genes_magus_01"},
    {"genesNpcPatriarch", "genes_patriarch_01"},
    {"genesNpcPrimus", "genes_primus_01"},
    {"necroNpc1TutWarrior", "necro_npc_01"},
    {"necroNpc1TutWarriorFTUEtest", "necro_npc_01"},
    {"necroNpc1Warrior", "necro_npc_01"},
    {"necroNpc2FlayedOne", "necro_npc_02"},
    {"necroNpc2TutFlayedOne", "necro_npc_02"},
    {"necroNpc2TutFlayedOneFTUEtest", "necro_npc_02"},
    {"necroNpc3Deathmark", "necro_npc_03"},
    {"necroNpc4Destroyer", "necro_ophydian_01"},
    {"necroNpc4DestroyerLHE", "necro_ophydian_01"},
    {"necroNpc4DestroyerSurv", "necro_ophydian_01"},
    {"necroNpc5Swarm", "necro_scarab_01"},
    {"necroNpcLHESwarm", "necro_scarab_01"},
    {"orksNpc1Grot", "orkss_grot_01"},
    {"orksNpc2OrkBoy", "orkss_boy_01"},
    {"orksNpc3GrotTank", "orkss_tank_01"},
    {"orksNpc4AmmoGrot", "orkss_grot_01"},
    {"orksNpc5LootGrotTeam", "orkss_grot_01"},
    {"orksNpc6Stormboy", "orkss_stormboy_01"},
    {"orksNpc7Squig", "orkss_squig_01"},
    {"orksNpc7SquigSurv", "orkss_squig_01"},
    {"orksNpcBigMek", "orkss_mek_01"},
    {"orksNpcKillaKan", "orkss_killakan_01"},
    {"orksNpcMoWRukkatrukk", "orkss_rukkatruk_01"},
    {"orksNpcNob", "orkss_nob_01"},
    {"orksNpcRuntherd", "orkss_runtherd_01"},
    {"orksNpcWarboss", "orkss_warboss_01"},
    {"tauNpc1FireWarrior", "tauta_firewarrior_01"},
    {"tauNpc2DroneSniper", "tauta_drone_01"},
    {"tauNpc3DroneShield", "tauta_drone_02"},
    {"tauNpc4DroneCommandLink", "tauta_drone_04"},
    {"tauNpc5StealthSuit", "tauta_stealthsuit_01"},
    {"tauNpc6Carnivore", "tauta_carnivore_01"},
    {"tauNpcAunShi", "tauta_aunshi_01"},
    {"tauNpcCrisis", "tauta_crisis_01"},
    {"tauNpcDarkstrider", "tauta_darkstrider_01"},
    {"tauNpcMarksman", "tauta_marksman_01"},
    {"tauNpcMoWBroadside", "tauta_broadside_01"},
    {"tauNpcShadowsun", "tauta_shadowsun_01"},
    {"templNpc1Initiate", "templ_initiate_01"},
    {"templNpc2Neophyte", "templ_neophyte_01"},
    {"templNpc3InitiatePyreblaster", "templ_pyreblaster_01"},
    {"templNpc4Aggressor", "templ_aggressor_01"},
    {"thousNpc1PinkHorror", "thous_horror_01"},
    {"thousNpc2Screamer", "thous_screamer_01"},
    {"thousNpc3RubricMarine", "thous_rubric_01"},
    {"thousNpc4Terminator", "thous_terminator_01"},
    {"tyranNpc1Hormagaunt", "tyran_hormagaunt_01"},
    {"tyranNpc1HormagauntGorgon", "tyran_hormagaunt_02"},
    {"tyranNpc1HormagauntKronos", "tyran_hormagaunt_03"},
    {"tyranNpc1Hormagaunt_SyncPvp_Gorgon", "tyran_hormagaunt_02"},
    {"tyranNpc1Hormagaunt_SyncPvp_Kronos", "tyran_hormagaunt_03"},
    {"tyranNpc2RipperSwarm", "tyran_ripper_01"},
    {"tyranNpc2RipperSwarmGorgon", "tyran_ripper_02"},
    {"tyranNpc2RipperSwarmKronos", "tyran_ripper_03"},
    {"tyranNpc2RipperSwarm_SyncPvp_Gorgon", "tyran_ripper_02"},
    {"tyranNpc2RipperSwarm_SyncPvp_Kronos", "tyran_ripper_03"},
    {"tyranNpc3Termagant", "tyran_termagant_01"},
    {"tyranNpc3TermagantGorgon", "tyran_termagant_02"},
    {"tyranNpc3TermagantKronos", "tyran_termagant_03"},
    {"tyranNpc3Termagant_SyncPvp_Gorgon", "tyran_termagant_02"},
    {"tyranNpc3Termagant_SyncPvp_Kronos", "tyran_termagant_03"},
    {"tyranNpc4Warrior", "tyran_warrior_01"},
    {"tyranNpc4WarriorCE2Gorgon", "tyran_warrior_02"},
    {"tyranNpc4WarriorCE2Kronos", "tyran_warrior_03"},
    {"tyranNpc4WarriorSurv", "tyran_warrior_01"},
    {"tyranNpc5Barbgaunt", "tyran_barbgaunt_01"},
    {"tyranNpc5BarbgauntSurv", "tyran_barbgaunt_01"},
    {"tyranNpc6SporeMine", "tyran_sporemine_01"},
    {"tyranNpcDeathleaper", "tyran_deathleaper_01"},
    {"tyranNpcMowBiovore", "tyran_biovore_01"},
    {"tyranNpcNeurothrope", "tyran_neurothrope_01"},
    {"tyranNpcParasite", "tyran_parasite_01"},
    {"tyranNpcTyrantGuard", "tyran_tyrantguard_01"},
    {"tyranNpcWingedPrime", "tyran_wingedprime_01"},
    {"ultraNpc1Inceptor", "ultra_inceptor_01"},
    {"ultraNpc2Eliminator", "ultra_eliminator_01"},
    {"ultraNpc3Intercessor", "ultra_intercessor_01"},
    {"ultraNpc4HeavyIntercessor", "ultra_intercessor_01"},
    {"ultraNpcApothecary", "ultra_apothecary_01"},
    {"ultraNpcCalgar", "ultra_calgar_01"},
    {"ultraNpcEliminatorSgt", "ultra_eliminator_01"},
    {"ultraNpcInceptorSgt", "ultra_inceptor_01"},
    {"ultraNpcMoWDreadnought", "ultra_dreadnought_01"},
    {"ultraNpcTigurius", "ultra_tigurius_01"},
    {"ultraNpcTitus", "ultra_titus_01"},
    {"adeptSmnGeminaeSuperia", "adept_geminae_01"},
    {"admecSmnElectropriest", "admec_electropriest_01"},
    {"admecSmnTechpriest", "admec_techpriest_01"},
    {"admecSmnVanguard", "admec_vanguard_01"},
    {"astraSmnDeathRider", "astra_deathrider_01"},
    {"astraSmnGuardsman", "astra_npc_01"},
    {"astraSmnKell", "astra_kell_01"},
    {"astraSmnMortar", "astra_mortar_01"},
    {"astraSmnVoxcaster", "astra_npc_03"},
    {"blackSmnBloodletter", "black_bloodletter_01"},
    {"blackSmnBloodletterHSE", "black_bloodletter_01"},
    {"blackSmnTerminator", "black_terminator_01"},
    {"bloodSmnIntercessor", "blood_intercessor_01"},
    {"deathPoxwalker", "death_poxwalker_01"},
    {"eldarSmnGuardian", "aelda_guardian_01"},
    {"eldarSmnHarlequin", "aelda_harlequin_01"},
    {"genesSmnAberrant", "genes_aberrant_01"},
    {"genesSmnDecoy", "genes_decoy_01"},
    {"genesSmnGenestealer", "genes_genestealer_01"},
    {"genesSmnNeophyte", "genes_neophyte_01"},
    {"genesDecoy", "genes_decoy_01"},
    {"necroSmnDeathmark", "necro_npc_03"},
    {"necroSmnDestroyer", "necro_hexmark_01"},
    {"necroSmnSwarm", "necro_scarab_01"},
    {"necroSmnWarrior", "necro_npc_01"},
    {"orksGrot", "orkss_grot_01"},
    {"orksGrotTank", "orkss_tank_01"},
    {"orksOrkBoys", "orkss_boy_01"},
    {"orksSmnSquig", "orkss_squig_01"},
    {"tauSmnDroneCommandLink", "tauta_drone_04"},
    {"tauSmnDroneShield", "tauta_drone_02"},
    {"tauSmnDroneSniper", "tauta_drone_01"},
    {"tauSmnStealthSuit", "tauta_stealthsuit_01"},
    {"templInitiate", "templ_initiate_01"},
    {"templInitiatePyreblaster", "templ_pyreblaster_01"},
    {"templNeophyte", "templ_neophyte_01"},
    {"thousSmnBlueHorror", "thous_horror_01"},
    {"thousSmnBlueHorrorHSE", "thous_horror_01"},
    {"thousSmnPinkHorror", "thous_horror_01"},
    {"thousSmnPinkHorrorHSE", "thous_horror_01"},
    {"thousSmnRubricMarine", "thous_rubric_01"},
    {"thousSmnScreamer", "thous_screamer_01"},
    {"thousSmnScreamerHSE", "thous_screamer_01"},
    {"tyranSmnHormagaunt", "tyran_hormagaunt_01"},
    {"tyranSmnRipperSwarm", "tyran_ripper_01"},
    {"tyranSmnSporeMine", "tyran_sporemine_01"},
    {"tyranSmnTermagant", "tyran_termagant_01"},
    {"tyranSmnWarrior", "tyran_warrior_01"},
    {"ultraSmnDreadnought", "ultra_dreadnought_01"},
    {"ultraSmnEliminator", "ultra_eliminator_01"},
    {"ultraSmnInceptor", "ultra_inceptor_01"},
    {"ultraSmnHeavyIntercessor", "ultra_intercessor_01"},
    {"powupArmor", "powup_armor_01"},
    {"powupBomb", "powup_bomb_01"},
    {"powupDamage", "powup_damage_01"},
    {"powupHealing", "powup_healing_01"},
    {"powupHealth", "powup_health_01"},
    {"powupHeroSpawn_BladeChampion", "powup_heroSpawn_01"},
    {"powupHeroSpawn_VexilusPraeto", "powup_heroSpawn_01"},
    {"powupHits", "powup_hits_01"},
    {"powupMeleeHits", "powup_meleehits_01"},
    {"powupReactivateAbility", "powup_reactivateability_01"},
    {"powupReinforcement", "powup_reinforcement_01"},
    {"powupReinforcementShield", "powup_reinforcementshield_01"},
    {"powupResurrect", "powup_resurrect_01"},
};

const Units::Ability* FindAbility(const GameConfig& game_config,
                                  const absl::string_view name) {
  for (const Units::Ability& ability :
       game_config.client_game_config().units().abilities()) {
    if (ability.id() == name) {
      return &ability;
    }
  }
  return nullptr;
}

void EmitAbilityDamageTypes(
    std::ofstream& out, const GameConfig& game_config,
    const google::protobuf::RepeatedPtrField<std::string>& abilities,
    const absl::string_view label) {
  std::set<absl::string_view> damage_types;
  for (const absl::string_view name : abilities) {
    const Units::Ability* ability = FindAbility(game_config, name);
    if (ability == nullptr) continue;
    for (const absl::string_view damage_type : ability->damage_types()) {
      if (!damage_type.empty()) {
        damage_types.insert(damage_type);
      }
    }
  }
  if (!damage_types.empty()) {
    out << ",\n";
    out << "        \"" << label << "\": [";
    bool first = true;
    for (const absl::string_view damage_type : damage_types) {
      if (!first) out << ", ";
      first = false;
      out << "\"" << damage_type << "\"";
    }
    out << "]";
  }
}

void EmitAbilities(
    std::ofstream& out, const GameConfig& game_config,
    const google::protobuf::RepeatedPtrField<std::string>& abilities,
    const absl::string_view label) {
  std::set<absl::string_view> ability_ids;
  for (const absl::string_view name : abilities) {
    const Units::Ability* ability = FindAbility(game_config, name);
    if (ability == nullptr) {
      LOG(ERROR) << "couldn't find ability \"" << name << "\"";
      continue;
    }
    ability_ids.insert(ability->id());
  }
  if (!ability_ids.empty()) {
    out << ",\n";
    out << "        \"" << label << "\": [";
    bool first = true;
    for (const absl::string_view ability_id : ability_ids) {
      if (!first) out << ", ";
      first = false;
      out << "\"" << ability_id << "\"";
    }
    out << "]";
  }
}

// The format of the icon path appears to be
// ui_image_portrait_<faction>_<lowername>_01.png. The _01 is because some units
// appear multiple times with different color schemes (tyranids and TSons
// horrors), but we can take the first one for our purpose.
std::string GetIconPath(const absl::string_view id,
                        const GameConfig& game_config) {
  const std::string img_prefix = "ui_image_portrait_";
  const std::string img_suffix = ".png";

  const auto it = kIdToSprite.find(std::string(id));
  if (it == kIdToSprite.end()) {
    LOG(ERROR) << "Couldn't find sprite for {\"" << id << "\", \"\"}";
    return "";
  }

  const std::string img = absl::StrCat(img_prefix, it->second, img_suffix);
  const std::string full_path = absl::StrCat("out/sprites/", img);
  struct stat sbuf;
  const int res = stat(full_path.c_str(), &sbuf);
  if (res != 0) {
    LOG(ERROR) << "Couldn't find sprite for {\"" << id << "\"} at { '"
               << full_path << "' }";
  }

  return absl::StrCat("snowprint_assets/characters/", img);
}

void EmitStats(std::ofstream& out,
               const google::protobuf::RepeatedPtrField<Npc::Stats>& stats) {
  out << ",\n";
  out << "        \"Stats\": [\n";
  bool first = true;
  for (const Npc::Stats& stat : stats) {
    if (!first) {
      out << ",\n";
    }
    first = false;
    out << "          {\n";
    out << "            \"AbilityLevel\": " << stat.ability_level() << ",\n";
    out << "            \"Damage\": " << stat.damage() << ",\n";
    out << "            \"Armor\": " << stat.armor() << ",\n";
    out << "            \"Health\": " << stat.health() << ",\n";
    out << "            \"ProgressionIndex\": " << stat.progression_index()
        << ",\n";
    out << "            \"Rank\": " << stat.rank() << ",\n";
    out << "            \"Stars\": " << stat.stars() << "\n";
    out << "          }";
  }
  out << "\n        ]";
}

}  // namespace

// Creates the character data in the provided JSON root.
// Returns an error status if the creation fails.
absl::Status CreateNpcData(const absl::string_view path,
                           const GameConfig& game_config) {
  std::ofstream out(std::string(path).c_str());

  out << "[";
  bool first = true;

  for (const Npc& npc : game_config.client_game_config().units().npcs()) {
    if (!first) out << ",";
    first = false;
    out << "\n";
    out << "    {\n";
    out << "        \"id\": \"" << npc.id() << "\",\n";
    out << "        \"Name\": \"" << npc.name() << "\",\n";
    out << "        \"Faction\": \"" << npc.faction_id() << "\",\n";
    out << "        \"Alliance\": \"" << npc.alliance() << "\",\n";
    out << "        \"Melee Damage\": \"" << npc.melee_attack().damage_type()
        << "\",\n";
    out << "        \"Melee Hits\": " << npc.melee_attack().hits() << ",\n";
    if (npc.has_ranged_attack()) {
      out << "        \"Ranged Damage\": \""
          << npc.ranged_attack().damage_type() << "\",\n";
      out << "        \"Ranged Hits\": " << npc.ranged_attack().hits() << ",\n";
      out << "        \"Distance\": " << npc.ranged_attack().range() << ",\n";
    }
    out << "        \"Movement\": " << npc.movement() << ",\n";
    out << "        \"Traits\": [";
    bool first_trait = true;
    for (const absl::string_view trait : npc.traits()) {
      if (!first_trait) out << ", ";
      first_trait = false;
      out << "\"" << trait << "\"";
    }
    out << "]";
    EmitStats(out, npc.stats());
    EmitAbilityDamageTypes(out, game_config, npc.active_abilities(),
                           "Active Ability Damage");
    EmitAbilityDamageTypes(out, game_config, npc.passive_abilities(),
                           "Passive Ability Damage");
    EmitAbilities(out, game_config, npc.active_abilities(), "Active Abilities");
    EmitAbilities(out, game_config, npc.passive_abilities(),
                  "Passive Abilities");
    out << ",\n";
    out << "        \"Icon\": \"" << GetIconPath(npc.id(), game_config)
        << "\"\n";
    out << "    }";
  }
  out << "\n]\n";

  out.close();
  return absl::OkStatus();
}

}  // namespace dataminer
