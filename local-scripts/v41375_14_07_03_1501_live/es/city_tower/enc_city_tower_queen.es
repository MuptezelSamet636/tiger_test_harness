# es\city_tower\enc_city_tower_queen.es
#
# The Queen's Wrath Tower's own bundle (city_tower_queen, global in every
# bubble; unnamed in the build, so by hash): the Queen's Emissary's vendor
# (row "queens_guard") and its performance. Local addition: the build ships
# no script for it. The performance's hash is not known, so none is started.

@activity_bundle(0x83105EE7)

squad sq_queen_vendor

@startup()
script sc_queen_vendor():
    sq_queen_vendor.place()
    sq_queen_vendor.activate_temperament("temper_tower_vendor")
