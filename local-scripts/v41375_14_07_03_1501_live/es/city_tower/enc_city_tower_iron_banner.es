# es\city_tower\enc_city_tower_iron_banner.es
#
# The Iron Banner Tower's own bundle (city_tower_iron_banner, global in every
# bubble; unnamed in the build, so by hash): Lord Saladin (row "lothar") and
# his vendor performance. Local addition: the build ships no script for it.
# The performance's hash is not known, so none is started.

@activity_bundle(0xF687DB0A)

squad sq_iron_banner_vendor

@startup()
script sc_iron_banner_vendor():
    sq_iron_banner_vendor.place()
    sq_iron_banner_vendor.activate_temperament("temper_tower_vendor")
