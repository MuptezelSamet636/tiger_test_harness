# es\city_tower\enc_boulevard_amb1.es
#
# Tower North (the boulevard): the Outfitter (avatar), the New Monarchy
# vendor and the Speaker. Local addition: this build ships no boulevard
# script, so nobody here was ever placed. Modelled on the ff build's
# boulevard script and this build's plaza script. No performances are
# started (their hashes for these three are not known); the Speaker is
# placed from his squad's first member only.
# Not placed: the civilians, the walkers, the droid greeters, the black
# market and the playtest vendor.

@activity_bundle("enc_boulevard_amb1")

bool debug_boulevard
squad sq_boulevard_vendor_avatar
squad sq_boulevard_vendor_nm
squad sq_boulevard_the_mask
squad_member sq_boulevard_the_mask__mask_a

@startup()
script sc_main_boulevard_thread():
    sc_boulevard_vendor_avatar.wake()
    sc_boulevard_vendor_nm.wake()
    sc_boulevard_the_mask.wake()

script sc_boulevard_vendor_avatar():
    if debug_boulevard:
        print("sc_boulevard_vendor_avatar")
    sq_boulevard_vendor_avatar.place()
    sq_boulevard_vendor_avatar.activate_temperament("temper_tower_vendor")

script sc_boulevard_vendor_nm():
    if debug_boulevard:
        print("sc_boulevard_vendor_nm")
    sq_boulevard_vendor_nm.place()
    sq_boulevard_vendor_nm.activate_temperament("temper_tower_vendor")

script sc_boulevard_the_mask():
    if debug_boulevard:
        print("sc_boulevard_the_mask")
    sq_boulevard_the_mask__mask_a.place()
    sq_boulevard_the_mask.activate_temperament("temper_tower_vendor")
