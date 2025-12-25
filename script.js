import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signInAnonymously, setPersistence, browserLocalPersistence, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, collection, addDoc, query, where, onSnapshot, orderBy, serverTimestamp, setDoc, doc, getDocs, getDoc, deleteDoc, limit, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

        // --- Configuration ---
        // CRITICAL FIX: Use the system provided ID to avoid permission errors
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'tchat-terminal';
        
        const firebaseConfig = {
            apiKey: "AIzaSyCc4hgOZCeHnBgcwHk7mWMaQEbjodVLuc4",
            authDomain: "tchat-b75ee.firebaseapp.com",
            projectId: "tchat-b75ee",
            storageBucket: "tchat-b75ee.firebasestorage.app",
            messagingSenderId: "602448689642",
            appId: "1:602448689642:web:435a9f48ea2e80debeda93",
            measurementId: "G-T7P87XTZ15"
        };

        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);

        setPersistence(auth, browserLocalPersistence).catch(console.error);

        // --- State ---
        let currentUser = null;
        let currentChatPartner = null; 
        let messagesUnsubscribe = null;
        let notificationUnsubscribe = null;
        let channelMetaUnsubscribe = null; // For radio channel metadata
        let activeRadioParticipants = new Set(); // Stores display names for radio autocomplete
        let currentChannelAdmins = []; // Array of Admin UIDs for current radio

        const state = {
            mode: 'COMMAND', // COMMAND, CHAT, RADIO, PROFILE_EDIT
            muted: false,
            booting: true, 
            theme: 'green'
        };
        
        // --- Command History ---
        const cmdHistory = [];
        let historyIndex = -1;

        // --- Autocomplete Data ---
        const commandsList = [
            'help', 'login', 'logout', 'friend', 'friends', 'friends-email', 'chat', 'reqbox', 'radio',
            'burn', 'theme', 'ascii', 'mute', 'unmute', 
            'clear', 'status', 'date', 'exit', 'emoji', 'ping', 'neofetch', 'set-bio', 'whois', 'mentions',
            'host', 'unhost', 'kick', 'unkick', 'host-list'
        ];

        const subCommands = {
            'theme': ['green', 'amber', 'blue', 'white', 'matrix'],
            'status': ['online', 'away', 'busy'],
            'friend': ['add', 'nick'],
            'host': ['add', 'remove']
        };

        let autocompleteOptions = [];
        let autocompleteIndex = -1;

        // --- Emoji Map ---
        const EMOJI_MAP = {
            '(acid)': '⊂(◉‿◉)つ', '(afraid)': '(ㆆ _ ㆆ)', '(alpha)': 'α', '(angel)': '☜(⌒▽⌒)☞', '(angry)': '•`_´•',
            '(arrowhead)': '⤜(ⱺ ʖ̯ⱺ)⤏', '(apple)': '', '(ass)': '(‿|‿)', '(butt)': '(‿|‿)', '(awkward)': '•͡˘㇁•͡˘',
            '(bat)': '/|\\ ^._.^ /|\\', '(bear)': 'ʕ·͡ᴥ·ʔ﻿', '(koala)': 'ʕ·͡ᴥ·ʔ﻿', '(bearflip)': 'ʕノ•ᴥ•ʔノ ︵ ┻━┻',
            '(bearhug)': 'ʕっ•ᴥ•ʔっ', '(because)': '∵', '(since)': '∵', '(beta)': 'β', '(bigheart)': '❤',
            '(bitcoin)': '₿', '(blackeye)': '0__#', '(blubby)': '( 0 _ 0 )', '(blush)': '(˵ ͡° ͜ʖ ͡°˵)',
            '(bond)': '┌( ͝° ͜ʖ͡°)=ε/̵͇̿̿/’̿’̿ ̿', '(007)': '┌( ͝° ͜ʖ͡°)=ε/̵͇̿̿/’̿’̿ ̿', '(boobs)': '( . Y . )', '(bored)': '(-_-)',
            '(bribe)': '( •͡˘ _•͡˘)ノð', '(bubbles)': '( ˘ ³˘)ノ°ﾟº❍｡', '(butterfly)': 'ƸӜƷ', '(cat)': '(= ФェФ=)',
            '(catlenny)': '( ͡° ᴥ ͡°)﻿', '(check)': '✔', '(cheer)': '※\\(^o^)/※', '(chubby)': '╭(ʘ̆~◞౪◟~ʘ̆)╮',
            '(claro)': '(͡ ° ͜ʖ ͡ °)', '(clique)': 'ヽ༼ ຈل͜ຈ༼ ▀̿̿Ĺ̯̿̿▀̿ ̿༽Ɵ͆ل͜Ɵ͆ ༽ﾉ', '(gang)': 'ヽ༼ ຈل͜ຈ༼ ▀̿̿Ĺ̯̿̿▀̿ ̿༽Ɵ͆ل͜Ɵ͆ ༽ﾉ',
            '(squad)': 'ヽ༼ ຈل͜ຈ༼ ▀̿̿Ĺ̯̿̿▀̿ ̿༽Ɵ͆ل͜Ɵ͆ ༽ﾉ', '(cloud)': '☁', '(club)': '♣', '(coffee)': 'c[_]', '(cuppa)': 'c[_]',
            '(cmd)': '⌘', '(command)': '⌘', '(cool)': '(•_•) ( •_•)>⌐■-■ (⌐■_■)', '(csi)': '(•_•) ( •_•)>⌐■-■ (⌐■_■)',
            '(copy)': '©', '(c)': '©', '(creep)': 'ԅ(≖‿≖ԅ)', '(creepcute)': 'ƪ(ړײ)‎ƪ​​', '(crim3s)': '( ✜︵✜ )',
            '(cross)': '†', '(cry)': '(╥﹏╥)', '(crywave)': '( ╥﹏╥) ノシ', '(cute)': '(｡◕‿‿◕｡)', '(d1)': '⚀',
            '(d2)': '⚁', '(d3)': '⚂', '(d4)': '⚃', '(d5)': '⚄', '(d6)': '⚅', '(dab)': 'ヽ( •_)ᕗ',
            '(damnyou)': '(ᕗ ͠° ਊ ͠° )ᕗ', '(dance)': 'ᕕ(⌐■_■)ᕗ ♪♬', '(dead)': 'x⸑x', '(dealwithit)': '(⌐■_■)',
            '(dwi)': '(⌐■_■)', '(delta)': 'Δ', '(depressed)': '(︶︹︶)', '(derp)': '☉ ‿ ⚆', '(diamond)': '♦',
            '(dj)': 'd[-_-]b', '(dog)': '(◕ᴥ◕ʋ)', '(dollar)': '$', '(dollarbill)': '[̲̅$̲̅(̲̅ιο̲̅̅)̲̅$̲̅]',
            '($)': '[̲̅$̲̅(̲̅ιο̲̅̅)̲̅$̲̅]', '(dong)': '(̿▀̿ ̿Ĺ̯̿̿▀̿ ̿)̄', '(donger)': 'ヽ༼ຈل͜ຈ༽ﾉ', '(dontcare)': '(- ʖ̯-)',
            '(idc)': '(- ʖ̯-)', '(dontwant)': 'ヽ(｀Д´)ﾉ', '(do not want)': 'ヽ(｀Д´)ﾉ', '(dope)': '<(^_^)>',
            '(<<)': '«', '(>>))': '»', '(doubleflat)': '𝄫', '(doublesharp)': '𝄪', '(doubletableflip)': '┻━┻ ︵ヽ(`Д´)ﾉ︵ ┻━┻',
            '(down)': '↓', '(duckface)': '(・3・)', '(duel)': 'ᕕ(╭ರ╭ ͟ʖ╮•́)⊃¤=(————-', '(duh)': '(≧︿≦)',
            '(dunno)': '¯\\(°_o)/¯', '(ebola)': 'ᴇʙᴏʟᴀ', '(eeriemob)': '(-(-_-(-_(-_(-_-)_-)-_-)_-)_-)-)',
            '(ellipsis)': '…', '(...)': '…', '(emdash)': '–', '(--)': '–', '(emptystar)': '☆',
            '(emptytriangle)': '△', '(t2)': '△', '(endure)': '(҂◡_◡) ᕤ', '(envelope)': '✉︎', '(letter)': '✉︎',
            '(epsilon)': 'ɛ', '(euro)': '€', '(evil)': 'ψ(｀∇´)ψ', '(evillenny)': '(͠≖ ͜ʖ͠≖)',
            '(excited)': '(ﾉ◕ヮ◕)ﾉ*:・ﾟ✧', '(execution)': '(⌐■_■)︻╦╤─ (╥﹏╥)', '(facebook)': '(╯°□°)╯︵ ʞooqǝɔɐɟ',
            '(facepalm)': '(－‸ლ)', '(fancytext)': 'вєωαяє, ι αм ƒαη¢у!', '(fart)': '(ˆ⺫ˆ๑)<3', '(fight)': '(ง •̀_•́)ง',
            '(finn)': '| (• ◡•)|', '(fish)': '<"(((<3', '(5)': '卌', '(five)': '卌', '(5/8)': '⅝', '(flat)': '♭',
            '(bemolle)': '♭', '(flexing)': 'ᕙ(`▽´)ᕗ', '(fliptext)': 'ǝןqɐʇ ɐ ǝʞıן ǝɯ dıןɟ',
            '(fliptexttable)': '(ノ ゜Д゜)ノ ︵ ǝןqɐʇ ɐ ǝʞıן ʇxǝʇ dıןɟ', '(flipped)': '┬─┬﻿ ︵ /(.□. \\）',
            '(heavytable)': '┬─┬﻿ ︵ /(.□. \\）', '(flower)': '(✿◠‿◠)', '(flor)': '(✿◠‿◠)', '(f)': '✿',
            '(fly)': '─=≡Σ((( つ◕ل͜◕)つ', '(friendflip)': '(╯°□°)╯︵ ┻━┻ ︵ ╯(°□° ╯)', '(frown)': '(ღ˘⌣˘ღ)',
            '(fuckoff)': '୧༼ಠ益ಠ╭∩╮༽', '(gtfo)': '୧༼ಠ益ಠ╭∩╮༽', '(fuckyou)': '┌П┐(ಠ_ಠ)', '(fu)': '┌П┐(ಠ_ಠ)',
            '(gentleman)': 'ಠ_ರೃ', '(sir)': 'ಠ_ರೃ', '(monocle)': 'ಠ_ರೃ', '(ghast)': '= _ =', '(ghost)': '༼ つ ╹ ╹ ༽つ',
            '(gift)': '(´・ω・)っ由', '(present)': '(´・ω・)っ由', '(gimme)': '༼ つ ◕_◕ ༽つ',
            '(givemeyourmoney)': '(•-•)⌐', '(glitter)': '(*・‿・)ノ⌒*:･ﾟ✧', '(glasses)': '(⌐ ͡■ ͜ʖ ͡■)',
            '(glassesoff)': '( ͡° ͜ʖ ͡°)ﾉ⌐■-■', '(glitterderp)': '(ﾉ☉ヮ⚆)ﾉ ⌒*:･ﾟ✧', '(gloomy)': '(_゜_゜_)',
            '(goatse)': '(з๏ε)', '(gotit)': '(☞ﾟ∀ﾟ)☞', '(greet)': '( ´◔ ω◔`) ノシ', '(greetings)': '( ´◔ ω◔`) ノシ',
            '(gun)': '︻╦╤─', '(mg)': '︻╦╤─', '(hadouken)': '༼つಠ益ಠ༽つ ─=≡ΣO))', '(hammerandsickle)': '☭',
            '(hs)': '☭', '(handleft)': '☜', '(hl)': '☜', '(handright)': '☞', '(hr)': '☞', '(haha)': '٩(^‿^)۶',
            '(happy)': '٩( ๑╹ ꇴ╹)۶', '(happygarry)': 'ᕕ( ᐛ )ᕗ', '(h)': '♥', '(heart)': '♥', '(hello)': '(ʘ‿ʘ)╯',
            '(ohai)': '(ʘ‿ʘ)╯', '(bye)': '(ʘ‿ʘ)╯', '(help)': '\\(°Ω°)/', '(highfive)': '._.)/\\(._.',
            '(hitting)': '( ｀皿´)｡ﾐ/', '(hug)': '(づ｡◕‿‿◕｡)づ', '(hugs)': '(づ｡◕‿‿◕｡)づ',
            '(iknowright)': '┐｜･ิω･ิ#｜┌', '(ikr)': '┐｜･ิω･ิ#｜┌', '(illuminati)': '୧(▲ᴗ▲)ノ', '(infinity)': '∞',
            '(inf)': '∞', '(inlove)': '(っ´ω`c)♡', '(int)': '∫', '(internet)': 'ଘ(੭*ˊᵕˋ)੭* ̀ˋ ɪɴᴛᴇʀɴᴇᴛ',
            '(interrobang)': '‽', '(jake)': '(❍ᴥ❍ʋ)', '(kappa)': '(¬,‿,¬)', '(kawaii)': '≧◡≦',
            '(keen)': '┬┴┬┴┤Ɵ͆ل͜Ɵ͆ ༽ﾉ', '(kiahh)': '~\\(≧▽≦)/~', '(kiss)': '(づ ￣ ³￣)づ',
            '(kyubey)': '／人◕ ‿‿ ◕人＼', '(lambda)': 'λ', '(lazy)': '_(:3」∠)_', '(left)': '←', '(<-)': '←',
            '(lenny)': '( ͡° ͜ʖ ͡°)', '(lennybill)': '[̲̅$̲̅(̲̅ ͡° ͜ʖ ͡°̲̅)̲̅$̲̅]', '(lennyfight)': '(ง ͠° ͟ʖ ͡°)ง',
            '(lennyflip)': '(ノ ͡° ͜ʖ ͡°ノ) ︵ ( ͜。 ͡ʖ ͜。)', '(lennygang)': '( ͡°( ͡° ͜ʖ( ͡° ͜ʖ ͡°)ʖ ͡°) ͡°)',
            '(lennyshrug)': '¯\\_( ͡° ͜ʖ ͡°)_/¯', '(lennysir)': '( ಠ ͜ʖ ರೃ)', '(lennystalker)': '┬┴┬┴┤( ͡° ͜ʖ├┬┴┬┴',
            '(lennystrong)': 'ᕦ( ͡° ͜ʖ ͡°)ᕤ', '(lennywizard)': '╰( ͡° ͜ʖ ͡° )つ──☆*:・ﾟ', '(loading)': '███▒▒▒▒▒▒▒',
            '(lol)': 'L(° O °L)', '(look)': '(ಡ_ಡ)☞', '(loud)': 'ᕦ(⩾﹏⩽)ᕥ', '(noise)': 'ᕦ(⩾﹏⩽)ᕥ',
            '(love)': '♥‿♥', '(lovebear)': 'ʕ♥ᴥ♥ʔ', '(lumpy)': '꒰ ꒡⌓꒡꒱', '(luv)': '-`ღ´-',
            '(magic)': 'ヽ(｀Д´)⊃━☆ﾟ. * ･ ｡ﾟ,', '(magicflip)': '(/¯◡ ‿ ◡)/¯ ~ ┻━┻', '(meep)': '\\(°^°)/',
            '(meh)': 'ಠ_ಠ', '(metal)': '\\m/,(> . <)_\\m/', '(rock)': '\\m/,(> . <)_\\m/', '(mistyeyes)': 'ಡ_ಡ',
            '(monster)': '༼ ༎ຶ ෴ ༎ຶ༽', '(natural)': '♮', '(needle)': '┌(◉ ͜ʖ◉)つ┣▇▇▇═──',
            '(inject)': '┌(◉ ͜ʖ◉)つ┣▇▇▇═──', '(nerd)': '(⌐⊙_⊙)', '(nice)': '( ͡° ͜ °)', '(no)': '→_←',
            '(noclue)': '／人◕ __ ◕人＼', '(nom)': '(っˆڡˆς)', '(yummy)': '(っˆڡˆς)', '(delicious)': '(っˆڡˆς)',
            '(note)': '♫', '(sing)': '♫', '(nuclear)': '☢', '(radioactive)': '☢', '(nukular)': '☢',
            '(nyan)': '~=[,,_,,]:3', '(nyeh)': '@^@', '(ohshit)': '( º﹃º )', '(omega)': 'Ω', '(omg)': '◕_◕',
            '(1/8)': '⅛', '(1/4)': '¼', '(1/2)': '½', '(1/3)': '⅓', '(opt)': '⌥', '(option)': '⌥', '(orly)': '(눈_눈)',
            '(ohyou)': '(◞థ౪థ)ᴖ', '(ou)': '(◞థ౪థ)ᴖ', '(peace)': '✌(-‿-)✌', '(victory)': '✌(-‿-)✌',
            '(pear)': '(__>-', '(pi)': 'π', '(pingpong)': '( •_•)O*¯`·.¸.·´¯`°Q(•_• )', '(plain)': '._.',
            '(pleased)': '(˶‾᷄ ⁻̫ ‾᷅˵)', '(point)': '(☞ﾟヮﾟ)☞', '(pooh)': 'ʕ •́؈•̀)', '(porcupine)': '(•ᴥ• )́`́\'́`́\'́⻍',
            '(pound)': '£', '(praise)': '(☝ ՞ਊ ՞)☝', '(punch)': 'O=(\'-\'Q)', '(rage)': 't(ಠ益ಠt)',
            '(mad)': 't(ಠ益ಠt)', '(rageflip)': '(ノಠ益ಠ)ノ彡┻━┻', '(rainbowcat)': '(=^･ｪ･^=))ﾉ彡☆',
            '(really)': 'ò_ô', '(r)': '®', '(right)': '→', '(->)': '→', '(riot)': '୧༼ಠ益ಠ༽୨', '(rolldice)': '⚃',
            '(rolleyes)': '(◔_◔)', '(rose)': '✿ڿڰۣ—', '(run)': '(╯°□°)╯', '(sad)': 'ε(´סּ︵סּ`)з',
            '(saddonger)': 'ヽ༼ຈʖ̯ຈ༽ﾉ', '(sadlenny)': '( ͡° ʖ̯ ͡°)', '(7/8)': '⅞', '(sharp)': '♯', '(diesis)': '♯',
            '(shout)': '╚(•⌂•)╝', '(shrug)': '¯\\_(ツ)_/¯', '(shy)': '=^_^=', '(sigma)': 'Σ', '(sum)': 'Σ',
            '(skull)': '☠', '(smile)': 'ツ', '(smiley)': '☺︎', '(smirk)': '¬‿¬', '(snowman)': '☃',
            '(sob)': '(;´༎ຶД༎ຶ`)', '(soviettableflip)': 'ノ┬─┬ノ ︵ ( \\o°o)\\', '(spade)': '♠', '(sqrt)': '√',
            '(squid)': '<コ:彡', '(star)': '★', '(strong)': 'ᕙ(⇀‸↼‶)ᕗ', '(suicide)': 'ε/̵͇̿̿/’̿’̿ ̿(◡︵◡)',
            '(sum)': '∑', '(sun)': '☀', '(surprised)': '(๑•́ ヮ •̀๑)', '(surrender)': '\\_(-_-)_/',
            '(stalker)': '┬┴┬┴┤(･_├┬┴┬┴', '(swag)': '(̿▀̿‿ ̿▀̿ ̿)', '(sword)': 'o()xxxx[{::::::::::::::::::>',
            '(tabledown)': '┬─┬﻿ ノ( ゜-゜ノ)', '(tableflip)': '(ノ ゜Д゜)ノ ︵ ┻━┻', '(tau)': 'τ', '(tears)': '(ಥ﹏ಥ)',
            '(terrorist)': '୧༼ಠ益ಠ༽︻╦╤─', '(thanks)': '\\(^-^)/', '(thankyou)': '\\(^-^)/', '(ty)': '\\(^-^)/',
            '(therefore)': '⸫', '(so)': '⸫', '(this)': '( ͡° ͜ʖ ͡°)_/¯', '(3/8)': '⅜', '(tiefighter)': '|=-(¤)-=|',
            '(tired)': '(=____=)', '(toldyouso)': '☜(꒡⌓꒡)', '(toldyou)': '☜(꒡⌓꒡)', '(toogood)': 'ᕦ(òᴥó)ᕥ',
            '(tm)': '™', '(triangle)': '▲', '(t)': '▲', '(2/3)': '⅔', '(unflip)': '┬──┬ ノ(ò_óノ)', '(up)': '↑',
            '(victory)': '(๑•̀ㅂ•́)ง✧', '(wat)': '(ÒДÓױ)', '(wave)': '( * ^ *) ノシ', '(whaa)': 'Ö',
            '(whistle)': '(っ^з^)♪♬', '(whoa)': '(°o•)', '(why)': 'ლ(`◉◞౪◟◉‵ლ)',
            '(witchtext)': 'WHΣИ $HΛLL WΣ †HЯΣΣ MΣΣ† ΛGΛ|И?', '(woo)': '＼(＾O＾)／', '(wtf)': '(⊙＿⊙\')',
            '(wut)': '⊙ω⊙', '(yay)': '\\( ﾟヮﾟ)/', '(yeah)': '(•̀ᴗ•́)و ̑̑', '(yes)': '(•̀ᴗ•́)و ̑̑', '(yen)': '¥',
            '(yinyang)': '☯', '(yy)': '☯', '(yolo)': 'Yᵒᵘ Oᶰˡʸ Lᶤᵛᵉ Oᶰᶜᵉ', '(youkids)': 'ლ༼>╭ ͟ʖ╮<༽ლ',
            '(ukids)': 'ლ༼>╭ ͟ʖ╮<༽ლ', '(y u no)': '(屮ﾟДﾟ)屮 Y U NO', '(yuno)': '(屮ﾟДﾟ)屮 Y U NO',
            '(zen)': '⊹╰(⌣ʟ⌣)╯⊹', '(meditation)': '⊹╰(⌣ʟ⌣)╯⊹', '(omm)': '⊹╰(⌣ʟ⌣)╯⊹',
            '(zoidberg)': '(V) (°,,,,°) (V)', '(zombie)': '[¬º-°]¬'
        };

        // --- Sound System ---
        const SoundSys = {
            ctx: null,
            init: function() {
                if (!this.ctx) {
                    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                }
                if (this.ctx.state === 'suspended') {
                    this.ctx.resume();
                }
            },
            playTone: function(freq, type, duration, vol=0.1) {
                if (state.muted || !this.ctx) return;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
                gain.gain.setValueAtTime(vol, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + duration);
            },
            click: function() { this.playTone(800, 'square', 0.05, 0.05); },
            blip: function() { this.playTone(1200, 'sine', 0.15, 0.1); },
            alert: function() { 
                this.playTone(1500, 'square', 0.1, 0.2); 
                setTimeout(() => this.playTone(1500, 'square', 0.1, 0.2), 150);
            }
        };

        // --- Theme System ---
        const Themes = {
            green: { main: '#33ff00', system: '#ffaa00', chat: '#00ccff', error: '#ff3333', radio: '#ff33cc' },
            amber: { main: '#ffb000', system: '#ffcc00', chat: '#ffb000', error: '#ff5500', radio: '#ff8800' },
            blue:  { main: '#0088ff', system: '#00aaff', chat: '#00ffff', error: '#ff3333', radio: '#cc00ff' },
            white: { main: '#e0e0e0', system: '#ffffff', chat: '#cccccc', error: '#ff3333', radio: '#ff00ff' },
            matrix: { main: '#00ff41', system: '#008f11', chat: '#003b00', error: '#ff3333', radio: '#00ff00' }
        };

        function applyTheme(themeName) {
            const theme = Themes[themeName];
            if (!theme) return false;
            const r = document.documentElement;
            r.style.setProperty('--terminal-main', theme.main);
            r.style.setProperty('--terminal-glow', theme.main);
            r.style.setProperty('--system-color', theme.system);
            r.style.setProperty('--chat-color', theme.chat);
            r.style.setProperty('--error-color', theme.error);
            if(theme.radio) r.style.setProperty('--radio-color', theme.radio);
            return true;
        }

        // --- UI References ---
        const input = document.getElementById('command-input');
        const inputLineContainer = document.getElementById('input-line-container');
        const history = document.getElementById('chat-history');
        const container = document.getElementById('terminal-container');
        const promptSpan = document.getElementById('prompt-span');
        const cmdBefore = document.getElementById('cmd-before');
        const cmdCursor = document.getElementById('cmd-cursor');
        const cmdAfter = document.getElementById('cmd-after');
        const autocompleteMenu = document.getElementById('autocomplete-menu');
        const fileInput = document.getElementById('file-upload'); 
        const tabBtn = document.getElementById('tab-btn');
        const editorOverlay = document.getElementById('profile-editor-overlay');
        const crtOverlay = document.getElementById('crt-overlay');

        // Editor Refs
        const editNick = document.getElementById('edit-nick');
        const editBio = document.getElementById('edit-bio');
        const editAvatar = document.getElementById('edit-avatar');
        const editorElements = [
            document.getElementById('row-nick'), 
            document.getElementById('row-bio'), 
            document.getElementById('row-avatar'),
            document.getElementById('btn-save'),
            document.getElementById('btn-cancel')
        ];
        
        let editorSelection = 0;
        let editorIsEditing = false;
        let editorBuffer = '';
        let editorAvatarBuffer = null;

        function updateInputDisplay() {
            if (state.mode === 'PROFILE_EDIT') return; // Don't update main input display in edit mode

            const val = input.value;
            const selStart = input.selectionStart || 0;
            const left = val.substring(0, selStart);
            const char = val.substring(selStart, selStart + 1) || '\u00A0';
            const right = val.substring(selStart + 1);

            cmdBefore.textContent = left;
            cmdCursor.textContent = char;
            cmdAfter.textContent = right;
        }

        ['input', 'click', 'focus', 'blur'].forEach(evt => {
            input.addEventListener(evt, () => requestAnimationFrame(updateInputDisplay));
        });

        // --- Tab Button Logic ---
        tabBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (state.mode === 'PROFILE_EDIT') {
                // Fix: Pass an object mimicking the event
                 handleProfileEditorKey({ key: 'Tab', preventDefault: () => {} });
            } else {
                input.focus(); 
                handleTabCompletion({ preventDefault: () => {} });
            }
        });

        // --- File Upload Handler ---
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            // IF IN EDITOR MODE
            if (state.mode === 'PROFILE_EDIT') {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                         const ascii = await convertImageToAscii(event.target.result);
                         editorAvatarBuffer = ascii;
                         editAvatar.textContent = "[ IMAGE SET (ASCII GENERATED) ]";
                    } catch(e) {
                         editAvatar.textContent = "[ ERROR CONVERTING ]";
                    }
                    fileInput.value = '';
                };
                reader.readAsDataURL(file);
                return;
            }
            
            // NORMAL CHAT MODE
            addMessage('SYSTEM', `PROCESSING IMAGE: ${file.name}...`, true);
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const ascii = await convertImageToAscii(event.target.result);
                    if (state.mode === 'COMMAND') {
                        addMessage(null, ascii, false, false, false, true);
                    } else {
                        await sendMessage(ascii, true, false); 
                    }
                } catch(err) {
                    addMessage('ERROR', 'CONVERSION FAILED: ' + err.message, false, false, true);
                }
                fileInput.value = ''; 
            };
            reader.readAsDataURL(file);
        });

        // --- Autocomplete Logic ---
        function showAutocompleteMenu(options) {
            autocompleteMenu.innerHTML = '';
            autocompleteOptions = options;
            autocompleteIndex = -1;

            if (options.length === 0) {
                autocompleteMenu.style.display = 'none';
                return;
            }

            options.forEach((opt, index) => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.textContent = opt;
                div.onclick = () => confirmSelection(opt);
                autocompleteMenu.appendChild(div);
            });

            autocompleteMenu.style.display = 'flex';
        }

        function hideAutocomplete() {
            autocompleteMenu.style.display = 'none';
            autocompleteOptions = [];
            autocompleteIndex = -1;
        }

        function highlightOption(index) {
            const items = autocompleteMenu.children;
            for (let i = 0; i < items.length; i++) {
                items[i].classList.remove('selected');
            }
            if (index >= 0 && index < items.length) {
                items[index].classList.add('selected');
                items[index].scrollIntoView({ block: 'nearest' });
            }
        }

        function confirmSelection(selectedValue) {
            const val = input.value;
            
            // Special handling for @(Mention) to support spaces
            if (selectedValue.startsWith('@(')) {
                // Find the last occurrence of '@(' to replace
                const lastAtParen = val.lastIndexOf('@(');
                if (lastAtParen !== -1) {
                    const prefix = val.substring(0, lastAtParen);
                    input.value = prefix + selectedValue + ' ';
                    hideAutocomplete();
                    updateInputDisplay();
                    input.focus();
                    return;
                }
            }

            const lastSpaceIdx = val.lastIndexOf(' ');
            
            if (lastSpaceIdx === -1) {
                input.value = selectedValue + ' ';
            } else {
                const prefix = val.substring(0, lastSpaceIdx + 1);
                input.value = prefix + selectedValue + ' ';
            }
            
            hideAutocomplete();
            updateInputDisplay();
            input.focus();
        }

        function handleTabCompletion(e) {
            e.preventDefault();

            if (autocompleteMenu.style.display === 'flex') {
                autocompleteIndex = (autocompleteIndex + 1) % autocompleteOptions.length;
                highlightOption(autocompleteIndex);
                return;
            }

            const val = input.value;
            let matches = [];

            // 1. Check for Mention: @(...)
            // Matches "@(\" at end, or "@(some text\" at end
            const mentionMatch = val.match(/@\(([^)]*)$/);
            
            if (mentionMatch && state.mode === 'RADIO') {
                const term = mentionMatch[1].toLowerCase(); // text inside ( )
                const participants = Array.from(activeRadioParticipants);
                matches = participants
                    .filter(name => name.toLowerCase().startsWith(term))
                    .map(name => `@(${name})`);
            }
            else {
                // Standard command/emoji completion based on space splitting
                const parts = val.split(' '); 
                const currentWord = parts[parts.length - 1]; 

                if (currentWord.startsWith('(')) {
                    const emojiKeys = Object.keys(EMOJI_MAP);
                    matches = emojiKeys.filter(key => key.startsWith(currentWord));
                }
                else if (parts.length === 1 && currentWord !== "") {
                     matches = commandsList.filter(cmd => cmd.startsWith(currentWord));
                }
                else if (parts.length === 2 && !currentWord.startsWith('(')) {
                    const cmd = parts[0];
                    if (subCommands[cmd]) {
                        matches = subCommands[cmd].filter(sub => sub.startsWith(currentWord));
                    }
                }
            }

            if (matches.length === 1) {
                confirmSelection(matches[0]);
            } else if (matches.length > 1) {
                showAutocompleteMenu(matches);
            }
        }

        // --- Boot Sequence & Auth ---
        
        const bootText = [
            "BIOS DATE 01/01/99 14:22:55 VER 1.0.2",
            "CPU: NEC V60, SPEED: 33MHz",
            "640K RAM SYSTEM... OK",
            "LOADING T-OS KERNEL...",
            "MOUNTING VIRTUAL FILESYSTEM... OK",
            "INITIATING NETWORK PROTOCOLS...",
            "  > TCP/IP... UP",
            "  > FIREWALL... ACTIVE",
            "  > ENCRYPTION... ENABLED",
            "CONNECTING TO SATELLITE UPLINK...",
            "CONNECTION ESTABLISHED.",
            "STARTING T-CHAT INTERFACE..."
        ];

        async function runBootSequence() {
            // Attempt to initialize audio context
            SoundSys.init();

            // Wait a moment for effect
            await new Promise(r => setTimeout(r, 800));
            
            for (const line of bootText) {
                // Play text sound
                SoundSys.click();
                
                addMessage(null, line, true); 
                // Random typing delay
                await new Promise(r => setTimeout(r, 100 + Math.random() * 250));
            }
            
            // Final pause before clear
            await new Promise(r => setTimeout(r, 1000));
            
            history.innerHTML = '';
            state.booting = false;
            
            // Show UI
            inputLineContainer.style.opacity = '1';
            input.focus();
            showWelcomeScreen();
        }

        function showWelcomeScreen() {
            const logo = `
  _______   _____ _           _   
 |__   __| / ____| |         | |  
    | |   | |    | |__   __ _| |_ 
    | |   | |    | '_ \\ / _\` | __|
    | |   | |____| | | | (_| | |_ 
    |_|    \\_____|_| |_|\\__,_|\\__|  v2.0
            `;
            addMessage(null, logo, false, false, false, true); // Ascii art mode

            addMessage('SYSTEM', 'WELCOME, USER.', true);
            addMessage(null, '------------------------------------------------');
            addMessage(null, 'QUICK START GUIDE:');
            addMessage(null, '1. LOGIN:        Type "login" to sign in with Google.');
            addMessage(null, '2. COMMANDS:     Type "help" to see available tools.');
            addMessage(null, '3. SHORTCUTS:    Press [TAB] to autocomplete commands.');
            addMessage(null, '4. EMOJIS:       Type "(" and [TAB] to see the menu.');
            addMessage(null, '                 Ex: (tableflip) -> (ノ ゜Д゜)ノ ︵ ┻━┻');
            addMessage(null, '------------------------------------------------');
            
            // If auth finished during boot, show status now
            if (currentUser && !currentUser.isAnonymous) {
                addMessage('SYSTEM', `SESSION RESTORED: ${currentUser.email}`, true);
            }
            
            addMessage('SYSTEM', 'SYSTEM READY. AWAITING INPUT...', true);
        }

        const initGuestAuth = async () => {
            try { await signInAnonymously(auth); } 
            catch (e) { console.warn("Guest login failed:", e.code); }
        };

        const updateStatus = async (status) => {
            if (!currentUser || currentUser.isAnonymous) return;
            try {
                const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'user_profiles', currentUser.uid);
                
                // Also update joinedAt if missing (legacy fix)
                await setDoc(userRef, {
                    status: status,
                    lastSeen: serverTimestamp()
                }, { merge: true });
                return true;
            } catch(e) { console.error(e); return false; }
        };

        // --- Notification Listener ---
        function setupNotificationListener(uid) {
            if (notificationUnsubscribe) notificationUnsubscribe();
            
            const notifRef = collection(db, 'artifacts', appId, 'users', uid, 'notifications');
            const q = query(notifRef, orderBy('timestamp', 'desc'), limit(1));
            
            notificationUnsubscribe = onSnapshot(q, (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === "added") {
                        const notif = change.doc.data();
                        // Only alert if recent (within last 30 seconds) to avoid spam on load
                        if (notif.timestamp && (Date.now() - notif.timestamp.toMillis()) < 30000) {
                            triggerNotificationEffect(notif);
                        }
                    }
                });
            });
        }

        function triggerNotificationEffect(notif) {
            SoundSys.alert();
            
            // Screen Flash
            crtOverlay.classList.add('notification-flash');
            setTimeout(() => crtOverlay.classList.remove('notification-flash'), 500);
            
            addMessage('ALERT', `MENTIONED BY [${notif.fromName}]: "${notif.preview}"`, true);
        }

        onAuthStateChanged(auth, async (user) => {
            currentUser = user;
            if (user) {
                if (user.isAnonymous) {
                     updatePrompt('guest');
                     // Only show if not booting (boot sequence handles initial welcome)
                     if (!state.booting) addMessage('SYSTEM', 'GUEST MODE ACTIVE.', true);
                } else {
                    updatePrompt(user.email.split('@')[0]);
                    if (!state.booting) addMessage('SYSTEM', `AUTHENTICATED AS ${user.email}`, true);
                    
                    await updateStatus('online');
                    setupNotificationListener(user.uid);

                    try {
                        const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'user_profiles', user.uid);
                        // Ensure basic profile exists
                        const snap = await getDoc(userRef);
                        const baseData = {
                            email: user.email,
                            displayName: user.displayName || user.email.split('@')[0],
                            uid: user.uid,
                            status: 'online',
                            lastSeen: serverTimestamp()
                        };
                        
                        if (!snap.exists() || !snap.data().joinedAt) {
                            baseData.joinedAt = serverTimestamp();
                        }
                        
                        await setDoc(userRef, baseData, { merge: true });
                    } catch (e) {}
                }
            } else {
                updatePrompt('offline');
                initGuestAuth();
                if (notificationUnsubscribe) notificationUnsubscribe();
            }
        });

        // Trigger Boot
        window.onload = runBootSequence;

        const handleLogin = async () => {
            try {
                addMessage('SYSTEM', 'INITIATING GOOGLE AUTH HANDSHAKE...', true);
                const provider = new GoogleAuthProvider();
                await signInWithPopup(auth, provider);
            } catch (error) {
                if (error.code === 'auth/unauthorized-domain') {
                    addMessage('ERROR', 'DOMAIN NOT AUTHORIZED. Check Firebase Console.', false, false, true);
                } else {
                    addMessage('ERROR', `LOGIN FAILED: ${error.message}`, false, false, true);
                }
            }
        };

        function updatePrompt(username) {
            if (state.mode === 'CHAT') {
                const name = currentChatPartner.nickname || currentChatPartner.email;
                promptSpan.textContent = `[CHAT:${name}] >`;
                input.style.caretColor = 'var(--chat-color)';
            } else if (state.mode === 'RADIO') {
                const name = currentChatPartner.frequency;
                promptSpan.textContent = `[RADIO:${name}] >`;
                input.style.caretColor = 'var(--radio-color)';
            } else {
                promptSpan.textContent = `${username}@TChat:~$`;
                input.style.caretColor = 'var(--terminal-main)';
            }
        }

        // --- Effects ---
        function parseEmojis(text) {
             return text.replace(/\([^)]+\)/g, (match) => EMOJI_MAP[match] || match);
        }

        // Updated scrambleText to accept finalHTML
        function scrambleText(element, finalValidText, finalHTML = null) {
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
            let iterations = 0;
            const originalText = finalValidText;
            
            const interval = setInterval(() => {
                element.innerText = originalText.split('').map((char, index) => {
                    if (char === ' ' || char === '\n') return char; 
                    if (index < Math.floor(iterations)) return originalText[index];
                    return chars[Math.floor(Math.random() * chars.length)];
                }).join('');
                
                if (iterations >= originalText.length) {
                    clearInterval(interval);
                    // FIX: Restore the HTML (highlights) after animation ends
                    if (finalHTML) {
                        element.innerHTML = finalHTML;
                    } else {
                        element.innerText = originalText;
                    }
                }
                
                iterations += 1/3 + (originalText.length / 300); 
            }, 60); 
        }

        const msgMap = new Map();

        function addMessage(sender, text, isSystem = false, isChat = false, isError = false, isAscii = false, msgId = null, isBurn = false, isRadio = false) {
            const msgDiv = document.createElement('div');
            msgDiv.classList.add('message-line');
            if (isSystem) msgDiv.classList.add('system-msg');
            if (isChat) msgDiv.classList.add('chat-msg');
            if (isRadio) msgDiv.classList.add('radio-msg');
            if (isError) msgDiv.classList.add('error-msg');
            if (isAscii) msgDiv.classList.add('ascii-art');

            if (msgId) {
                msgDiv.setAttribute('data-msg-id', msgId);
                msgMap.set(msgId, msgDiv);
            }

            if (!state.muted && (isSystem || (isChat && sender !== 'ME') || (isRadio && sender !== 'ME'))) {
                setTimeout(() => SoundSys.blip(), 50);
            }

            const contentSpan = document.createElement('span');

            if (sender) {
                let prefixColor = 'var(--terminal-main)';
                
                if (isChat) {
                    prefixColor = (sender === 'ME') ? 'var(--terminal-main)' : 'var(--chat-color)';
                }
                
                if (isSystem) prefixColor = 'var(--system-color)';
                if (isError) prefixColor = 'var(--error-color)';
                
                const prefixSpan = document.createElement('span');
                prefixSpan.className = 'user-prefix';
                prefixSpan.style.color = prefixColor;
                prefixSpan.textContent = `[${sender}]: `;
                msgDiv.appendChild(prefixSpan);
            }

            // Highlight Mentions @(Name)
            let finalHTML = null;
            if (!isAscii && text) {
                // Escape HTML basic
                let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                // Regex for @(mention)
                html = html.replace(/@\((.*?)\)/g, '<span class="highlight-mention">@($1)</span>');
                contentSpan.innerHTML = html;
                finalHTML = html; // Store the HTML for the scramble effect
            } else {
                contentSpan.textContent = text; 
            }

            msgDiv.appendChild(contentSpan);

            if (isBurn) {
                const burnSpan = document.createElement('span');
                burnSpan.className = 'burn-timer';
                burnSpan.textContent = ' [10s]';
                msgDiv.appendChild(burnSpan);

                let left = 10;
                const timer = setInterval(() => {
                    left--;
                    if(left >= 0) burnSpan.textContent = ` [${left}s]`;
                    else {
                        clearInterval(timer);
                    }
                }, 1000);
            }

            history.appendChild(msgDiv);
            scrollToBottom();

            if ((isChat && sender !== 'ME') || isSystem || (isRadio && sender !== 'ME')) {
                // FIX: Pass finalHTML to scrambleText so it can restore the highlight
                if (!isAscii) scrambleText(contentSpan, text, finalHTML);
            }

            return msgDiv;
        }

        function scrollToBottom() {
            history.scrollTop = history.scrollHeight;
        }

        // --- Command Processing ---
        
        // --- Intercept Keys for Profile Editor ---
        document.addEventListener('keydown', (event) => {
            if (state.mode === 'PROFILE_EDIT') {
                handleProfileEditorKey(event);
                return;
            }
        });

        input.addEventListener('keydown', function(event) {
            if (state.mode === 'PROFILE_EDIT') return; // Should be handled by document listener above but safety check

            SoundSys.init();
            
            if (event.key === 'Tab') {
                handleTabCompletion(event);
                return; 
            }

            if (autocompleteMenu.style.display === 'flex') {
                if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    autocompleteIndex = (autocompleteIndex - 1 + autocompleteOptions.length) % autocompleteOptions.length;
                    highlightOption(autocompleteIndex);
                    return;
                }
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    autocompleteIndex = (autocompleteIndex + 1) % autocompleteOptions.length;
                    highlightOption(autocompleteIndex);
                    return;
                }
                if (event.key === 'Enter') {
                    if (autocompleteIndex >= 0) {
                        event.preventDefault();
                        confirmSelection(autocompleteOptions[autocompleteIndex]);
                        return;
                    }
                    hideAutocomplete();
                }
                if (event.key === 'Escape') {
                    hideAutocomplete();
                    return;
                }
            } else {
                if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    if (cmdHistory.length > 0) {
                        if (historyIndex < cmdHistory.length - 1) {
                            historyIndex++;
                            input.value = cmdHistory[cmdHistory.length - 1 - historyIndex];
                            updateInputDisplay();
                        }
                    }
                    return;
                }
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    if (historyIndex > 0) {
                        historyIndex--;
                        input.value = cmdHistory[cmdHistory.length - 1 - historyIndex];
                    } else if (historyIndex === 0) {
                        historyIndex = -1;
                        input.value = '';
                    }
                    updateInputDisplay();
                    return;
                }
            }

            if (event.key.length === 1 || event.key === 'Backspace') {
                 if (event.key !== 'Tab') hideAutocomplete();
            }

            if (!['Enter', 'Shift', 'Control', 'Alt', 'ArrowUp', 'ArrowDown', 'Tab'].includes(event.key)) {
                SoundSys.click();
            }

            if (event.key === 'Enter') {
                const text = input.value; 
                const trimmed = text.trim();
                
                // Allow Shift+Enter to insert a newline
                if (event.shiftKey) {
                    return;
                }

                if (trimmed !== "") {
                    cmdHistory.push(trimmed);
                    historyIndex = -1;

                    if (state.mode === 'COMMAND') {
                        addMessage('ME', trimmed);
                        processCommand(trimmed);
                    } else {
                        processChatInput(trimmed);
                    }
                    input.value = '';
                    updateInputDisplay();
                }
                event.preventDefault(); // Prevent newline in textarea
            }
            requestAnimationFrame(updateInputDisplay);
        });

        document.addEventListener('click', (e) => { 
            // Don't steal focus if in profile editor
            if (state.mode === 'PROFILE_EDIT') return;

            input.focus(); 
            SoundSys.init();
            if (e.target !== autocompleteMenu && e.target.parentElement !== autocompleteMenu && e.target !== tabBtn) {
                hideAutocomplete();
            }
        });

        // --- Profile Editor Logic ---
        function openProfileEditor() {
            if (!ensureAuth()) return;
            state.mode = 'PROFILE_EDIT';
            editorOverlay.style.display = 'flex';
            
            // Load current data
            const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'user_profiles', currentUser.uid);
            getDoc(userRef).then(snap => {
                if(snap.exists()) {
                    const d = snap.data();
                    editNick.textContent = d.displayName || '';
                    editBio.textContent = d.bio || '';
                    if (d.avatarAscii) {
                        editorAvatarBuffer = d.avatarAscii;
                        editAvatar.textContent = "[ IMAGE SET ]";
                    }
                }
            });

            editorSelection = 0;
            editorIsEditing = false;
            updateEditorVisuals();
            setupEditorClicks(); // Ensure listeners are attached
        }

        function closeProfileEditor() {
            state.mode = 'COMMAND';
            editorOverlay.style.display = 'none';
            editorIsEditing = false;
            input.focus();
        }

        async function saveProfileEditor() {
            addMessage('SYSTEM', 'SAVING PROFILE...', true);
            const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'user_profiles', currentUser.uid);
            
            const rawNick = editNick.textContent.trim();
            const dataToUpdate = {
                displayName: rawNick,
                displayNameLower: rawNick.toLowerCase(), // Add this for easier search later
                bio: editBio.textContent.trim(),
            };
            
            if (editorAvatarBuffer) {
                dataToUpdate.avatarAscii = editorAvatarBuffer;
            }
            
            await setDoc(userRef, dataToUpdate, { merge: true });
            
            addMessage('SYSTEM', 'PROFILE UPDATED SUCCESSFULLY.', true);
            closeProfileEditor();
        }

        function updateEditorVisuals() {
            // Reset all
            editorElements.forEach(el => {
                el.classList.remove('active');
                el.classList.remove('editing');
            });

            // Highlight selected
            const currentEl = editorElements[editorSelection];
            currentEl.classList.add('active');
            
            if (editorIsEditing) {
                currentEl.classList.add('editing');
            }
        }

        function setupEditorClicks() {
            // Using .onclick to prevent duplicate listeners if called multiple times
            document.getElementById('row-nick').onclick = () => handleEditorInteraction(0);
            document.getElementById('row-bio').onclick = () => handleEditorInteraction(1);
            document.getElementById('row-avatar').onclick = () => handleEditorInteraction(2);
            document.getElementById('btn-save').onclick = () => handleEditorInteraction(3);
            document.getElementById('btn-cancel').onclick = () => handleEditorInteraction(4);
        }

        function handleEditorInteraction(index) {
            // If selecting a new row
            if (editorSelection !== index) {
                editorSelection = index;
                editorIsEditing = false;
                SoundSys.blip();
                updateEditorVisuals();
                return;
            }

            // If selecting the ALREADY selected row (Action/Edit)
            SoundSys.click();
            
            if (index === 0) { // Nick
                activateInlineInput(editNick);
            } 
            else if (index === 1) { // Bio
                activateInlineInput(editBio);
            }
            else if (index === 2) { // Avatar
                fileInput.click();
            }
            else if (index === 3) { // Save
                saveProfileEditor();
            }
            else if (index === 4) { // Cancel
                closeProfileEditor();
            }
        }

        function activateInlineInput(element) {
            // If already has input, ignore
            if (element.querySelector('input')) return;

            editorIsEditing = true;
            const currentText = element.textContent;
            element.textContent = ''; // Clear text
            
            const inputEl = document.createElement('input');
            inputEl.type = 'text';
            inputEl.value = currentText;
            inputEl.className = 'terminal-inline-input';
            
            // Commit on blur
            inputEl.addEventListener('blur', () => {
                commitInlineInput(element, inputEl);
            });
            
            // Commit on Enter or Tab
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    inputEl.blur(); 
                }
                else if (e.key === 'Tab') {
                    e.preventDefault();
                    inputEl.blur(); // Commit first
                    // Move selection down
                    editorSelection = (editorSelection + 1) % editorElements.length;
                    SoundSys.blip();
                    updateEditorVisuals();
                }
                e.stopPropagation(); // Stop global keydown
            });
            
            inputEl.addEventListener('click', (e) => e.stopPropagation()); // Don't trigger row click

            element.appendChild(inputEl);
            inputEl.focus();
            updateEditorVisuals();
        }

        function commitInlineInput(wrapperElement, inputElement) {
            const val = inputElement.value;
            wrapperElement.textContent = val;
            editorIsEditing = false;
            updateEditorVisuals();
        }

        function handleProfileEditorKey(e) {
            // If editing text, capture input (Though native input handles this now, keeping safety)
            if (editorIsEditing) {
                return; 
            }

            // Navigation
            if (e.key === 'Tab' || e.key === 'ArrowDown') {
                e.preventDefault();
                editorSelection = (editorSelection + 1) % editorElements.length;
                SoundSys.blip();
                updateEditorVisuals();
            } else if (e.key === 'ArrowUp') {
                 e.preventDefault();
                 editorSelection = (editorSelection - 1 + editorElements.length) % editorElements.length;
                 SoundSys.blip();
                 updateEditorVisuals();
            }
            // Actions (Desktop)
            else if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                SoundSys.click();
                
                if (editorSelection === 0) { // Nick
                    activateInlineInput(editNick);
                }
                else if (editorSelection === 1) { // Bio
                    activateInlineInput(editBio);
                }
                else if (editorSelection === 2) { // Avatar
                     fileInput.click();
                }
                else if (editorSelection === 3) { // Save
                     saveProfileEditor();
                }
                else if (editorSelection === 4) { // Cancel
                     closeProfileEditor();
                }
            }
        }

        // --- ASCII Art Processor ---
        async function fetchAscii(url) {
             const lowerUrl = url.toLowerCase();
             const isImage = /\.(jpg|jpeg|png|gif|webp)$/.test(lowerUrl);
             
             if (isImage) {
                 return await convertImageToAscii(url);
             } else {
                 // Try fetching as text (existing behavior)
                 const response = await fetch(url);
                 if (!response.ok) throw new Error("Network error: " + response.status);
                 return await response.text();
             }
        }

        function convertImageToAscii(url) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = "Anonymous";
                img.src = url;
                
                img.onload = () => {
                    const cols = 100; // Increased width for better resolution
                    const charAspect = 0.5; 
                    const aspect = img.height / img.width;
                    const rows = Math.floor(cols * aspect * charAspect);
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = cols;
                    canvas.height = rows;
                    const ctx = canvas.getContext('2d');
                    
                    ctx.drawImage(img, 0, 0, cols, rows);
                    
                    try {
                        const data = ctx.getImageData(0, 0, cols, rows).data;
                        let ascii = "";
                        // Denser character ramp for smoother shading
                        const chars = " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
                        
                        for (let y = 0; y < rows; y++) {
                            for (let x = 0; x < cols; x++) {
                                const i = (y * cols + x) * 4;
                                const brightness = (data[i] + data[i+1] + data[i+2]) / 3;
                                const charIdx = Math.floor((brightness / 255) * (chars.length - 1));
                                ascii += chars[charIdx];
                            }
                            ascii += "\n";
                        }
                        resolve(ascii);
                    } catch (e) {
                        reject(new Error("CORS blocked image data access. Try using an image host like Imgur."));
                    }
                };
                
                img.onerror = () => reject(new Error("Failed to load image. Check URL."));
            });
        }

        async function processCommand(rawCmd) {
            const parts = rawCmd.split(' ');
            const cmd = parts[0].toLowerCase();
            const args = parts.slice(1);

            switch (cmd) {
                case 'help':
                    addMessage('SYSTEM', 'COMMANDS:', true);
                    addMessage(null, '  login            - Sign in with Google');
                    addMessage(null, '  logout           - Sign out');
                    addMessage(null, '  set-bio          - Open Profile Editor');
                    addMessage(null, '  whois [email]    - View User Profile');
                    addMessage(null, '  mentions         - Check tags/mentions');
                    addMessage(null, '  friend add [email]     - Add friend');
                    addMessage(null, '  friend nick [email] [nick] - Set nickname');
                    addMessage(null, '  friends          - List friends');
                    addMessage(null, '  friends-email    - List emails & nicknames');
                    addMessage(null, '  reqbox           - Check for new messages');
                    addMessage(null, '  status [mode]    - online/away/busy');
                    addMessage(null, '  chat [name/email] - Start chat');
                    addMessage(null, '  radio [freq]     - Join broadcast freq');
                    addMessage(null, '  host             - Claim Radio Host (*)');
                    addMessage(null, '  host [name]      - Add Admin (Host only)');
                    addMessage(null, '  unhost [name]    - Remove Admin (Host only)');
                    addMessage(null, '  kick [name]      - Ban User (Admin only)');
                    addMessage(null, '  unkick [name]    - Unban User (Admin only)');
                    addMessage(null, '  host-list        - Show Admins');
                    addMessage(null, '  ping [email]     - Check user availability');
                    addMessage(null, '  neofetch         - Display system info');
                    addMessage(null, '  burn [msg]       - Send self-destruct msg');
                    addMessage(null, '  theme [color]    - Set color');
                    addMessage(null, '  ascii [url]      - Render ASCII (Image or Text)');
                    addMessage(null, '                     Type "ascii" with no url to upload.'); // Updated Help
                    addMessage(null, '  emoji            - List emoji codes');
                    addMessage(null, '  mute / unmute    - Toggle sounds');
                    addMessage(null, '  clear            - Clear screen');
                    break;

                case 'clear':
                    history.innerHTML = '';
                    break;

                case 'set-bio':
                    openProfileEditor();
                    break;

                case 'whois':
                    if (args[0]) {
                        await runWhois(args[0]);
                    } else {
                        // If no arg, show self
                        await runWhois(currentUser.email);
                    }
                    break;

                case 'mentions':
                    await showRecentMentions();
                    break;

                case 'emoji':
                    addMessage('SYSTEM', 'AVAILABLE EMOJIS (Type code to use):', true);
                    const emojiList = Object.keys(EMOJI_MAP).join(' ');
                    addMessage(null, emojiList);
                    break;

                case 'status':
                    if (!ensureAuth()) return;
                    const validStatuses = ['online', 'away', 'busy'];
                    if (args[0] && validStatuses.includes(args[0])) {
                        await updateStatus(args[0]);
                        addMessage('SYSTEM', `STATUS SET TO: ${args[0].toUpperCase()}`, true);
                    } else {
                        addMessage('SYSTEM', 'USAGE: status [online | away | busy]', true);
                    }
                    break;

                case 'burn':
                    if (state.mode === 'CHAT') {
                        addMessage('ERROR', 'ENTER A CHAT ROOM TO USE BURN.', false, false, true);
                    } else {
                        addMessage('ERROR', 'ENTER A CHAT ROOM TO USE BURN.', false, false, true);
                    }
                    break;

                case 'mute':
                    state.muted = true;
                    addMessage('SYSTEM', 'SOUNDS MUTED.', true);
                    break;

                case 'unmute':
                    state.muted = false;
                    SoundSys.init();
                    SoundSys.blip(); 
                    addMessage('SYSTEM', 'SOUNDS ACTIVE.', true);
                    break;
                
                case 'ascii':
                    if (args[0]) {
                        addMessage('SYSTEM', `FETCHING ASCII FROM ${args[0]}...`, true);
                        try {
                            const asciiArt = await fetchAscii(args[0]);
                            addMessage(null, asciiArt, false, false, false, true);
                        } catch (e) {
                            addMessage('ERROR', `FAILED: ${e.message}`, false, false, true);
                        }
                    } else {
                        // No URL provided -> Trigger Upload
                        fileInput.click();
                    }
                    break;

                case 'theme':
                    if (args[0] && applyTheme(args[0])) {
                        addMessage('SYSTEM', `THEME SET TO ${args[0].toUpperCase()}`, true);
                    } else {
                        addMessage('SYSTEM', 'USAGE: theme [green|amber|blue|white|matrix]', true);
                    }
                    break;

                case 'login':
                    if (currentUser && !currentUser.isAnonymous) {
                        addMessage('SYSTEM', 'ALREADY LOGGED IN.', true);
                    } else {
                        await handleLogin();
                    }
                    break;

                case 'logout':
                    if (currentUser && !currentUser.isAnonymous) {
                        try {
                            await signOut(auth);
                            addMessage('SYSTEM', 'LOGGED OUT. REVERTING TO GUEST MODE...', true);
                        } catch (e) {
                            addMessage('ERROR', 'LOGOUT FAILED: ' + e.message, false, false, true);
                        }
                    } else {
                        addMessage('SYSTEM', 'ALREADY IN GUEST MODE.', true);
                    }
                    break;

                case 'friend':
                    if (!ensureAuth()) return;
                    if (args[0] === 'add' && args[1]) {
                        addFriend(args[1]);
                    } else if (args[0] === 'nick' && args[1] && args[2]) {
                        setNickname(args[1], args[2]);
                    } else {
                        addMessage('SYSTEM', 'USAGE: friend add [email] OR friend nick [email] [nick]', true);
                    }
                    break;

                case 'friends':
                    if (!ensureAuth()) return;
                    listFriends();
                    break;

                case 'friends-email':
                    if (!ensureAuth()) return;
                    listFriendsEmails();
                    break;

                case 'reqbox':
                    if (!ensureAuth()) return;
                    checkReqBox();
                    break;

                case 'chat':
                    if (!ensureAuth()) return;
                    if (args[0]) {
                        startChat(args[0]);
                    } else {
                        addMessage('SYSTEM', 'USAGE: chat [name/email]', true);
                    }
                    break;
                
                case 'radio':
                    if (!ensureAuth()) return;
                    if (args[0]) {
                        joinRadio(args[0]);
                    } else {
                        addMessage('SYSTEM', 'USAGE: radio [frequency] (e.g. 101.5)', true);
                    }
                    break;
                
                case 'host':
                    if (args.length > 0) {
                        // Promote logic: host @name or host name
                        let target = args.join(' ');
                        // Remove @() if present
                        const match = target.match(/@\((.*?)\)/);
                        if(match) target = match[1];
                        await promoteUser(target);
                    } else {
                        // Claim logic
                        await claimRadioHost();
                    }
                    break;
                
                case 'unhost':
                    if (args.length > 0) {
                        let target = args.join(' ');
                        const match = target.match(/@\((.*?)\)/);
                        if(match) target = match[1];
                        await demoteUser(target);
                    } else {
                        addMessage('SYSTEM', 'USAGE: unhost [username]', true);
                    }
                    break;
                
                case 'kick':
                    if (args.length > 0) {
                        let target = args.join(' ');
                        const match = target.match(/@\((.*?)\)/);
                        if(match) target = match[1];
                        await kickUser(target);
                    } else {
                        addMessage('SYSTEM', 'USAGE: kick [username]', true);
                    }
                    break;
                
                case 'unkick':
                    if (args.length > 0) {
                        let target = args.join(' ');
                        const match = target.match(/@\((.*?)\)/);
                        if(match) target = match[1];
                        await unkickUser(target);
                    } else {
                        addMessage('SYSTEM', 'USAGE: unkick [username]', true);
                    }
                    break;
                
                case 'host-list':
                    await showRadioHost();
                    break;

                case 'date':
                    addMessage('SYSTEM', new Date().toString(), true);
                    break;

                case 'neofetch':
                    runNeofetch();
                    break;

                case 'ping':
                    if (!ensureAuth()) return;
                    if (args[0]) {
                        await pingUser(args[0]);
                    } else {
                        addMessage('SYSTEM', 'USAGE: ping [email]', true);
                    }
                    break;

                case 'exit':
                    break;

                default:
                    addMessage('SYSTEM', `UNKNOWN COMMAND: ${cmd}`, true);
            }
        }

        function ensureAuth() {
            if (!currentUser || currentUser.isAnonymous) {
                addMessage('ERROR', 'ACCESS DENIED. LOGIN REQUIRED.', false, false, true);
                return false;
            }
            return true;
        }

        // --- Feature Implementation ---

        async function showRecentMentions() {
            if (!ensureAuth()) return;
            addMessage('SYSTEM', 'FETCHING RECENT MENTIONS...', true);
            
            try {
                const notifRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'notifications');
                // Remove orderBy to avoid indexing issues if possible, or keep simple
                // If it fails, we remove orderBy. For now keeping it simple.
                const q = query(notifRef, limit(10)); 
                // Removed orderBy timestamp to prevent index errors. Results may not be perfectly ordered but will work.
                
                const snap = await getDocs(q);
                
                if (snap.empty) {
                    addMessage(null, 'NO RECENT MENTIONS FOUND.');
                    return;
                }
                
                // Sort in JS
                const notifs = [];
                snap.forEach(doc => notifs.push(doc.data()));
                notifs.sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
                
                notifs.forEach(data => {
                    const time = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleTimeString() : '??:??';
                    addMessage(null, `[${time}] ${data.fromName}: ${data.preview}`);
                });
                
            } catch(e) {
                addMessage('ERROR', 'FAILED: ' + e.message, false, false, true);
            }
        }

        async function runWhois(identifier) {
            addMessage('SYSTEM', `QUERYING DIRECTORY FOR: ${identifier}...`, true);
            
            try {
                const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'user_profiles');
                // Try Exact Match
                let q = query(usersRef, where("email", "==", identifier));
                let snapshot = await getDocs(q);
                
                // Fallback: Try Nickname (local friend logic not applied here for global whois, simplifying)
                if (snapshot.empty) {
                     // Try nickname search if we implemented public nicknames, but for now strict email
                     addMessage('ERROR', 'USER NOT FOUND.', false, false, true);
                     return;
                }
                
                const d = snapshot.docs[0].data();
                const joined = d.joinedAt ? new Date(d.joinedAt.seconds * 1000).toLocaleDateString() : 'Unknown';
                const status = d.status ? d.status.toUpperCase() : 'OFFLINE';
                
                addMessage(null, `+-----------------------------------------+`);
                addMessage(null, `| USER:   ${d.displayName || d.email}`);
                addMessage(null, `| EMAIL:  ${d.email}`);
                addMessage(null, `| STATUS: ${status}`);
                addMessage(null, `| SINCE:  ${joined}`);
                addMessage(null, `+-----------------------------------------+`);
                
                if (d.bio) {
                    addMessage(null, `BIO:\n${d.bio}`);
                    addMessage(null, `+-----------------------------------------+`);
                }
                
                if (d.avatarAscii) {
                    addMessage(null, `AVATAR:`);
                    addMessage(null, d.avatarAscii, false, false, false, true);
                    addMessage(null, `+-----------------------------------------+`);
                }

            } catch(e) {
                 addMessage('ERROR', 'WHOIS FAILED: ' + e.message, false, false, true);
            }
        }

        function runNeofetch() {
            const now = performance.now();
            const uptimeMins = Math.floor(now / 60000);
            const uptimeSecs = Math.floor((now % 60000) / 1000);
            
            const width = window.innerWidth;
            const height = window.innerHeight;
            
            // Simplified User Agent parsing
            let os = 'Unknown OS';
            if (navigator.userAgent.indexOf("Win") != -1) os = "Windows";
            if (navigator.userAgent.indexOf("Mac") != -1) os = "MacOS";
            if (navigator.userAgent.indexOf("Linux") != -1) os = "Linux";
            if (navigator.userAgent.indexOf("Android") != -1) os = "Android";
            if (navigator.userAgent.indexOf("like Mac") != -1) os = "iOS";

            let browser = 'Unknown Browser';
            if (navigator.userAgent.indexOf("Chrome") != -1) browser = "Chrome";
            if (navigator.userAgent.indexOf("Firefox") != -1) browser = "Firefox";
            if (navigator.userAgent.indexOf("Safari") != -1 && navigator.userAgent.indexOf("Chrome") == -1) browser = "Safari";

            const user = currentUser ? (currentUser.displayName || currentUser.email.split('@')[0]) : 'guest';
            const authStatus = currentUser && !currentUser.isAnonymous ? 'Authenticated' : 'Anonymous';
            const email = currentUser && !currentUser.isAnonymous ? currentUser.email : 'N/A';

            const logo = [
                "   _______   ",
                "  |__   __|  ",
                "     | |     ",
                "     | |     ",
                "     | |     ",
                "     |_|     "
            ];

            const info = [
                `USER:    ${user}@tchat`,
                `--------`,
                `OS:      ${os} (Web Kernel)`,
                `BROWSER: ${browser}`,
                `UPTIME:  ${uptimeMins}m ${uptimeSecs}s`,
                `RES:     ${width}x${height}`,
                `THEME:   ${state.theme}`,
                `STATUS:  ${authStatus}`,
                `EMAIL:   ${email}`
            ];

            let output = "";
            const logoWidth = 16;
            const maxLines = Math.max(logo.length, info.length);
            
            for(let i=0; i<maxLines; i++) {
                const logoLine = (logo[i] || "").padEnd(logoWidth, " ");
                const infoLine = info[i] || "";
                output += `${logoLine}  ${infoLine}\n`;
            }

            // Color bar at the bottom
            output += "\n   \u001b[31m███\u001b[32m███\u001b[33m███\u001b[34m███\u001b[35m███\u001b[36m███";
            
            addMessage(null, output, false, false, false, true);
        }

        async function pingUser(targetEmail) {
            addMessage('SYSTEM', `PINGING ${targetEmail}...`, true);
            const start = Date.now();
            try {
                const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'user_profiles');
                const q = query(usersRef, where("email", "==", targetEmail));
                const snapshot = await getDocs(q);
                
                const ms = Date.now() - start;

                if (!snapshot.empty) {
                    const data = snapshot.docs[0].data();
                    const status = data.status ? data.status.toUpperCase() : 'UNKNOWN';
                    addMessage('SYSTEM', `REPLY FROM ${targetEmail}: status=${status} time=${ms}ms`, true);
                } else {
                    addMessage('ERROR', `REQUEST TIMED OUT: ${targetEmail} not found.`, false, false, true);
                }
            } catch (error) {
                addMessage('ERROR', 'PING ERROR: ' + error.message, false, false, true);
            }
        }

        async function addFriend(targetEmail) {
            addMessage('SYSTEM', `SEARCHING...`, true);
            try {
                const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'user_profiles');
                const q = query(usersRef, where("email", "==", targetEmail));
                const snapshot = await getDocs(q);

                if (snapshot.empty) {
                    addMessage('ERROR', 'USER NOT FOUND.', false, false, true);
                    return;
                }
                const targetUser = snapshot.docs[0].data();
                const myFriendsRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'friends', targetUser.uid);
                await setDoc(myFriendsRef, {
                    email: targetUser.email,
                    uid: targetUser.uid,
                    displayName: targetUser.displayName,
                    addedAt: serverTimestamp()
                }, { merge: true });
                addMessage('SYSTEM', `FRIEND ADDED.`, true);
            } catch (error) {
                addMessage('ERROR', 'DB ERROR: ' + error.message, false, false, true);
            }
        }

        async function setNickname(targetEmail, nickname) {
            addMessage('SYSTEM', `SETTING NICKNAME...`, true);
            try {
                // Find friend by email in my friends list
                const friendsRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'friends');
                const q = query(friendsRef, where("email", "==", targetEmail));
                const snapshot = await getDocs(q);

                if (snapshot.empty) {
                    addMessage('ERROR', 'FRIEND NOT FOUND IN LIST. ADD FIRST.', false, false, true);
                    return;
                }

                const friendDoc = snapshot.docs[0];
                await setDoc(friendDoc.ref, { nickname: nickname }, { merge: true });
                addMessage('SYSTEM', `NICKNAME SET: ${nickname} -> ${targetEmail}`, true);
            } catch (error) {
                addMessage('ERROR', 'UPDATE FAILED: ' + error.message, false, false, true);
            }
        }

        async function listFriends() {
            addMessage('SYSTEM', 'FETCHING FRIEND LIST...', true);
            try {
                const friendsRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'friends');
                const snapshot = await getDocs(friendsRef);
                if (snapshot.empty) {
                    addMessage(null, 'No friends found.');
                    return;
                }
                
                // Fetch status for each friend
                const promises = snapshot.docs.map(async (docSnap) => {
                    const friend = docSnap.data();
                    const profileRef = doc(db, 'artifacts', appId, 'public', 'data', 'user_profiles', friend.uid);
                    const profileSnap = await getDoc(profileRef);
                    let status = 'offline';
                    if (profileSnap.exists()) {
                        status = profileSnap.data().status || 'offline';
                    }
                    return { ...friend, status };
                });

                const friendsWithStatus = await Promise.all(promises);

                friendsWithStatus.forEach(f => {
                    let dotClass = 'status-online'; 
                    if (f.status === 'away') dotClass = 'status-away';
                    if (f.status === 'busy') dotClass = 'status-busy';
                    
                    const displayName = f.nickname ? `${f.nickname} <${f.email}>` : f.email;
                    
                    const div = document.createElement('div');
                    div.className = 'message-line';
                    div.innerHTML = `<span class="status-dot ${dotClass}">●</span> ${displayName}`;
                    history.appendChild(div);
                });
                scrollToBottom();

            } catch (error) {
                addMessage('ERROR', error.message, false, false, true);
            }
        }

        async function listFriendsEmails() {
            addMessage('SYSTEM', 'FETCHING CONTACTS...', true);
            try {
                const friendsRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'friends');
                const snapshot = await getDocs(friendsRef);
                if (snapshot.empty) {
                    addMessage(null, 'No friends found.');
                    return;
                }
                
                snapshot.forEach(docSnap => {
                    const f = docSnap.data();
                    const info = f.nickname ? `NICK: ${f.nickname} | EMAIL: ${f.email}` : `EMAIL: ${f.email}`;
                    addMessage(null, info);
                });
                scrollToBottom();

            } catch (error) {
                addMessage('ERROR', error.message, false, false, true);
            }
        }

        async function checkReqBox() {
            addMessage('SYSTEM', 'SCANNING FREQUENCIES (REQBOX)...', true);
            try {
                // 1. Fetch my friend list to build a lookup set
                const friendsRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'friends');
                const friendsSnap = await getDocs(friendsRef);
                const friendMap = new Map(); // uid -> { nickname, email }
                friendsSnap.forEach(doc => {
                    const data = doc.data();
                    friendMap.set(data.uid, data);
                });

                // 2. Fetch messages sent to me
                const msgsRef = collection(db, 'artifacts', appId, 'public', 'data', 'messages');
                const q = query(msgsRef, where('receiverId', '==', currentUser.uid));
                const snapshot = await getDocs(q);

                if (snapshot.empty) {
                    addMessage(null, 'NO MESSAGES FOUND.');
                    return;
                }

                // 3. Aggregate unique senders
                const senders = new Set();
                snapshot.forEach(doc => {
                    senders.add(doc.data().senderId);
                });

                if (senders.size === 0) {
                    addMessage(null, 'NO MESSAGES FOUND.');
                    return;
                }

                addMessage(null, `FOUND MESSAGES FROM ${senders.size} USER(S):`);

                // 4. List each sender, marking friends
                for (const uid of senders) {
                    // Check if friend
                    if (friendMap.has(uid)) {
                        const friend = friendMap.get(uid);
                        const displayName = friend.nickname ? `${friend.nickname} <${friend.email}>` : friend.email;
                        addMessage(null, `> [FRIEND] ${displayName}`);
                    } else {
                        // Stranger - fetch profile for email
                        const profileRef = doc(db, 'artifacts', appId, 'public', 'data', 'user_profiles', uid);
                        const snap = await getDoc(profileRef);
                        if (snap.exists()) {
                            const data = snap.data();
                            addMessage(null, `> [NEW]    ${data.email}`);
                        } else {
                            addMessage(null, `> [NEW]    UNKNOWN_USER [${uid.slice(0,5)}..]`);
                        }
                    }
                }
                
                addMessage('SYSTEM', "TYPE 'chat [email/nick]' TO REPLY.", true);

            } catch (error) {
                console.error(error);
                if (error.message.includes('index')) {
                     addMessage('ERROR', 'INDEX MISSING. CHECK CONSOLE.', false, false, true);
                } else {
                     addMessage('ERROR', 'SCAN FAILED: ' + error.message, false, false, true);
                }
            }
        }

        async function startChat(identifier) {
            try {
                let friendData = null;
                
                // 1. Try finding in friends by nickname
                const friendsRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'friends');
                let q = query(friendsRef, where("nickname", "==", identifier));
                let snapshot = await getDocs(q);

                if (!snapshot.empty) {
                    friendData = snapshot.docs[0].data();
                } else {
                    // 2. Try finding in friends by email
                    q = query(friendsRef, where("email", "==", identifier));
                    snapshot = await getDocs(q);
                    if (!snapshot.empty) {
                        friendData = snapshot.docs[0].data();
                    }
                }

                // 3. If not in friends, try Public Directory (Global Lookup)
                if (!friendData) {
                    const publicUsersRef = collection(db, 'artifacts', appId, 'public', 'data', 'user_profiles');
                    const qPub = query(publicUsersRef, where("email", "==", identifier));
                    const snapPub = await getDocs(qPub);
                    
                    if (!snapPub.empty) {
                        friendData = snapPub.docs[0].data();
                        addMessage('SYSTEM', 'USER FOUND IN PUBLIC DIRECTORY (NOT IN FRIENDS).', true);
                    }
                }

                if (!friendData) {
                    addMessage('ERROR', 'USER NOT FOUND (CHECK EMAIL/NICK).', false, false, true);
                    return;
                }

                currentChatPartner = friendData;
                
                state.mode = 'CHAT';
                history.innerHTML = ''; 
                const chatName = friendData.nickname || friendData.email;
                addMessage('SYSTEM', `--- CONNECTION ESTABLISHED: ${chatName} ---`, true);
                addMessage('SYSTEM', `CMDS: 'burn [msg]', 'ascii [url]', 'exit'`, true);
                updatePrompt(currentUser.email);

                const convoId = getConversationId(currentUser.uid, friendData.uid);
                const msgsRef = collection(db, 'artifacts', appId, 'public', 'data', 'messages');
                
                const qMsg = query(msgsRef, where('conversationId', '==', convoId), orderBy('timestamp', 'asc'));

                if (messagesUnsubscribe) messagesUnsubscribe();

                messagesUnsubscribe = onSnapshot(qMsg, (snapshot) => {
                    snapshot.docChanges().forEach((change) => {
                        if (change.type === "added") {
                            const msg = change.doc.data();
                            let senderName;
                            if (msg.senderId === currentUser.uid) {
                                senderName = 'ME';
                            } else {
                                senderName = friendData.nickname || friendData.email.split('@')[0];
                            }
                            addMessage(senderName, msg.text, false, true, false, msg.isAscii || false, change.doc.id, msg.burn);
                        }
                        if (change.type === "removed") {
                            const msgId = change.doc.id;
                            const el = msgMap.get(msgId);
                            if (el) {
                                el.style.opacity = '0';
                                setTimeout(() => el.remove(), 500); 
                                msgMap.delete(msgId);
                            }
                        }
                    });
                }, (error) => {
                     if(error.message.includes("index")) {
                         addMessage('ERROR', 'INDEX REQUIRED. Check console.', false, false, true);
                         console.error(error);
                     }
                });
            } catch (error) {
                addMessage('ERROR', 'CHAT ERROR: ' + error.message, false, false, true);
            }
        }

        async function processChatInput(text) {
            const lowText = text.toLowerCase();
            const parts = text.split(' ');
            const cmd = parts[0].toLowerCase();
            
            // --- 1. INTERCEPT COMMANDS IN CHAT MODE ---
            const radioCommands = ['host', 'host-list', 'kick', 'unkick', 'unhost', 'help', 'clear', 'exit'];
            
            if (radioCommands.includes(cmd)) {
                // If it's a command, route it to processCommand instead of chatting it
                if (cmd !== 'exit') {
                    // Show a local echo so user knows it ran (optional, but good for UX)
                    addMessage('ME', text); 
                }
                await processCommand(text);
                return; // STOP here. Do not send as message.
            }
            // ------------------------------------------

            // Trigger upload from chat
            if (lowText === 'ascii' || lowText === 'upload') {
                fileInput.click();
                return;
            }

            let isBurn = false;
            let isAscii = false;
            let finalBody = text;
            
            if (lowText.startsWith('burn ')) {
                isBurn = true;
                finalBody = text.substring(5); // Remove 'burn '
            }

            if (finalBody.toLowerCase().startsWith('ascii ')) {
                addMessage('SYSTEM', 'FETCHING ASCII ART...', true);
                const url = finalBody.substring(6).trim();
                try {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error("Network error");
                    finalBody = await response.text();
                    isAscii = true;
                } catch (e) {
                    addMessage('ERROR', 'FAILED TO FETCH ASCII: ' + e.message, false, false, true);
                    return;
                }
            }

            finalBody = parseEmojis(finalBody);
            finalBody = finalBody.replace(/\(\?n\)/g, '\n');

            await sendMessage(finalBody, isAscii, isBurn);
        }

        async function sendMessage(text, isAscii, isBurn) {
            const msgsRef = collection(db, 'artifacts', appId, 'public', 'data', 'messages');
            
            // Determine IDs
            let convoId, receiverId;
            if (state.mode === 'RADIO') {
                convoId = currentChatPartner.id; // e.g., 'RADIO_101.5'
                receiverId = 'ALL';
            } else {
                convoId = getConversationId(currentUser.uid, currentChatPartner.uid);
                receiverId = currentChatPartner.uid;
            }

            try {
                // --- MENTION PARSING ---
                // Scan for @(name). Only works if we can find the user.
                
                // Regex to find @(mentions)
                const mentionMatches = text.match(/@\((.*?)\)/g);
                if (mentionMatches && mentionMatches.length > 0) {
                    mentionMatches.forEach(async (mention) => {
                        const targetName = mention.substring(2, mention.length - 1); // remove @( and )
                        
                        // Query user by displayName
                        const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'user_profiles');
                        const q = query(usersRef, where("displayName", "==", targetName));
                        const snap = await getDocs(q);
                        
                        if (!snap.empty) {
                            const targetUser = snap.docs[0].data();
                            // Create notification
                            if (targetUser.uid !== currentUser.uid) {
                                const notifRef = collection(db, 'artifacts', appId, 'users', targetUser.uid, 'notifications');
                                await addDoc(notifRef, {
                                    type: 'mention',
                                    from: currentUser.uid,
                                    fromName: currentUser.displayName || currentUser.email,
                                    preview: text.substring(0, 50),
                                    timestamp: serverTimestamp()
                                });
                            }
                        }
                    });
                }
                // -----------------------

                const payload = {
                    conversationId: convoId,
                    text: text,
                    senderId: currentUser.uid,
                    senderDisplayName: currentUser.displayName || currentUser.email.split('@')[0],
                    receiverId: receiverId,
                    burn: isBurn,
                    isAscii: isAscii,
                    timestamp: serverTimestamp()
                };

                // Add isHost flag if in radio mode and user is host
                if (state.mode === 'RADIO' && currentChannelAdmins.includes(currentUser.uid)) {
                    payload.isHost = true;
                }

                const docRef = await addDoc(msgsRef, payload);

                if (isBurn) {
                    setTimeout(async () => {
                        try {
                            await deleteDoc(docRef);
                        } catch(e) { console.error("Burn failed", e); }
                    }, 10000);
                }

            } catch (e) {
                addMessage('ERROR', 'SEND FAILED: ' + e.message, false, false, true);
            }
        }

        // --- Radio Helper Functions ---
        
        async function resolveUserByNickOrEmail(identifier) {
            // Try by email first
            const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'user_profiles');
            let q = query(usersRef, where("email", "==", identifier));
            let snapshot = await getDocs(q);
            
            if (!snapshot.empty) return snapshot.docs[0].data();

            // Try by displayName
            q = query(usersRef, where("displayName", "==", identifier));
            snapshot = await getDocs(q);
            if (!snapshot.empty) return snapshot.docs[0].data();

            return null;
        }
        
        async function claimRadioHost() {
            if (state.mode !== 'RADIO') {
                addMessage('ERROR', 'YOU MUST BE TUNED INTO A RADIO CHANNEL.', false, false, true);
                return;
            }
            
            const frequency = currentChatPartner.frequency;
            
            try {
                const channelRef = doc(db, 'artifacts', appId, 'public', 'data', 'radio_channels', frequency);
                const channelSnap = await getDoc(channelRef);

                let admins = [];
                if (channelSnap.exists()) {
                    admins = channelSnap.data().admins || [];
                }

                if (admins.length > 0) {
                    addMessage('ERROR', 'CHANNEL ALREADY HAS A HOST. ASK THEM TO ADD YOU.', false, false, true);
                } else {
                    // Claim
                    await setDoc(channelRef, {
                        admins: [currentUser.uid],
                        banned: [],
                        createdAt: serverTimestamp(),
                        frequency: frequency
                    }, { merge: true });
                    addMessage('SYSTEM', 'SUCCESS. YOU ARE NOW THE SUPER ADMIN (*).', true);
                }
            } catch (e) {
                addMessage('ERROR', 'CLAIM FAILED: ' + e.message, false, false, true);
            }
        }
        
        async function promoteUser(targetName) {
            if (state.mode !== 'RADIO') return;
            
            // Check if user is an admin
            if (!currentChannelAdmins.includes(currentUser.uid)) {
                addMessage('ERROR', 'PERMISSION DENIED. ADMINS ONLY.', false, false, true);
                return;
            }

            const targetUser = await resolveUserByNickOrEmail(targetName);
            if (!targetUser) {
                addMessage('ERROR', 'USER NOT FOUND.', false, false, true);
                return;
            }

            const channelRef = doc(db, 'artifacts', appId, 'public', 'data', 'radio_channels', currentChatPartner.frequency);
            await updateDoc(channelRef, {
                admins: arrayUnion(targetUser.uid)
            });
            addMessage('SYSTEM', `PROMOTED ${targetName} TO ADMIN.`, true);
        }
        
        async function demoteUser(targetName) {
            if (state.mode !== 'RADIO') return;
            
            // Check if user is an admin
            if (!currentChannelAdmins.includes(currentUser.uid)) {
                addMessage('ERROR', 'PERMISSION DENIED. ADMINS ONLY.', false, false, true);
                return;
            }

            const targetUser = await resolveUserByNickOrEmail(targetName);
            if (!targetUser) {
                addMessage('ERROR', 'USER NOT FOUND.', false, false, true);
                return;
            }

            const channelRef = doc(db, 'artifacts', appId, 'public', 'data', 'radio_channels', currentChatPartner.frequency);
            await updateDoc(channelRef, {
                admins: arrayRemove(targetUser.uid)
            });
            addMessage('SYSTEM', `REMOVED ADMIN STATUS FROM ${targetName}.`, true);
        }
        
        async function kickUser(targetName) {
            if (state.mode !== 'RADIO') return;
            
            // Check if user is an admin
            if (!currentChannelAdmins.includes(currentUser.uid)) {
                addMessage('ERROR', 'PERMISSION DENIED. ADMINS ONLY.', false, false, true);
                return;
            }

            const targetUser = await resolveUserByNickOrEmail(targetName);
            if (!targetUser) {
                addMessage('ERROR', 'USER NOT FOUND.', false, false, true);
                return;
            }

            const channelRef = doc(db, 'artifacts', appId, 'public', 'data', 'radio_channels', currentChatPartner.frequency);
            await updateDoc(channelRef, {
                banned: arrayUnion(targetUser.uid)
            });
            addMessage('SYSTEM', `KICKED AND BANNED ${targetName}.`, true);
        }

        async function unkickUser(targetName) {
            if (state.mode !== 'RADIO') return;
            
            // Check if user is an admin
            if (!currentChannelAdmins.includes(currentUser.uid)) {
                addMessage('ERROR', 'PERMISSION DENIED. ADMINS ONLY.', false, false, true);
                return;
            }

            const targetUser = await resolveUserByNickOrEmail(targetName);
            if (!targetUser) {
                addMessage('ERROR', 'USER NOT FOUND.', false, false, true);
                return;
            }

            const channelRef = doc(db, 'artifacts', appId, 'public', 'data', 'radio_channels', currentChatPartner.frequency);
            await updateDoc(channelRef, {
                banned: arrayRemove(targetUser.uid)
            });
            addMessage('SYSTEM', `UNBANNED ${targetName}.`, true);
        }

        async function showRadioHost() {
            if (state.mode !== 'RADIO') {
                addMessage('ERROR', 'YOU MUST BE TUNED INTO A RADIO CHANNEL.', false, false, true);
                return;
            }

            const frequency = currentChatPartner.frequency;
            addMessage('SYSTEM', `FETCHING ADMINS FOR ${frequency}...`, true);

            try {
                const channelRef = doc(db, 'artifacts', appId, 'public', 'data', 'radio_channels', frequency);
                const channelSnap = await getDoc(channelRef);

                if (!channelSnap.exists() || !channelSnap.data().admins || channelSnap.data().admins.length === 0) {
                    addMessage(null, 'NO ADMINS ASSIGNED.');
                    return;
                }

                const adminIds = channelSnap.data().admins;
                const bannedIds = channelSnap.data().banned || [];
                
                addMessage(null, `--- CHANNEL ADMINS ---`);
                for (const uid of adminIds) {
                    const profileRef = doc(db, 'artifacts', appId, 'public', 'data', 'user_profiles', uid);
                    const profileSnap = await getDoc(profileRef);
                    let name = "Unknown ID: " + uid;
                    if (profileSnap.exists()) {
                        name = profileSnap.data().displayName || profileSnap.data().email;
                    }
                    addMessage(null, `> ${name} (*)${uid === currentUser.uid ? ' [YOU]' : ''}`);
                }

                if (bannedIds.length > 0) {
                    addMessage(null, `--- BANNED USERS ---`);
                    addMessage(null, `> ${bannedIds.length} user(s) banned.`);
                }

            } catch (e) {
                addMessage('ERROR', 'LOOKUP FAILED: ' + e.message, false, false, true);
            }
        }
        
        async function joinRadio(frequency) {
            try {
                currentChatPartner = { 
                    type: 'radio', 
                    frequency: frequency, 
                    id: 'RADIO_' + frequency
                };
                
                state.mode = 'RADIO';
                history.innerHTML = ''; 
                activeRadioParticipants = new Set(); // Reset participants
                currentChannelAdmins = []; // Reset admins
                
                addMessage('SYSTEM', `--- TUNED TO FREQUENCY: ${frequency} MHz ---`, true);
                addMessage('SYSTEM', `BROADCASTING OPEN. ANYONE CAN HEAR YOU.`, true);
                updatePrompt(currentUser.email);

                // --- Real-time Channel Meta Listener (Admins/Bans) ---
                if (channelMetaUnsubscribe) channelMetaUnsubscribe();
                const channelRef = doc(db, 'artifacts', appId, 'public', 'data', 'radio_channels', frequency);
                
                // First, get the initial state of the channel
                try {
                    const channelSnap = await getDoc(channelRef);
                    if (channelSnap.exists()) {
                        const data = channelSnap.data();
                        currentChannelAdmins = data.admins || [];
                        
                        // Check if banned
                        if (data.banned && data.banned.includes(currentUser.uid)) {
                            // Leave channel
                            if (messagesUnsubscribe) messagesUnsubscribe();
                            if (channelMetaUnsubscribe) channelMetaUnsubscribe();
                            state.mode = 'COMMAND';
                            currentChannelAdmins = [];
                            history.innerHTML = '';
                            addMessage('ERROR', 'CONNECTION TERMINATED. FREQUENCY BLOCKED.', false, false, true);
                            updatePrompt(currentUser.email.split('@')[0]);
                            return;
                        }
                    } else {
                        currentChannelAdmins = [];
                    }
                } catch (error) {
                    // If we can't read the channel metadata, start with empty admin list
                    // This can happen if the channel doesn't exist yet or due to permission issues
                    currentChannelAdmins = [];
                    console.warn('Could not fetch initial channel metadata:', error.message);
                }
                
                channelMetaUnsubscribe = onSnapshot(channelRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        currentChannelAdmins = data.admins || [];
                        
                        // Check if banned
                        if (data.banned && data.banned.includes(currentUser.uid)) {
                            // Leave channel
                            if (messagesUnsubscribe) messagesUnsubscribe();
                            if (channelMetaUnsubscribe) channelMetaUnsubscribe();
                            state.mode = 'COMMAND';
                            currentChannelAdmins = [];
                            history.innerHTML = '';
                            addMessage('ERROR', 'CONNECTION TERMINATED. FREQUENCY BLOCKED.', false, false, true);
                            updatePrompt(currentUser.email.split('@')[0]);
                            return;
                        }
                    } else {
                        currentChannelAdmins = [];
                    }
                });

                const msgsRef = collection(db, 'artifacts', appId, 'public', 'data', 'messages');
                // Query by conversation ID "RADIO_{freq}"
                const qMsg = query(msgsRef, where('conversationId', '==', currentChatPartner.id), orderBy('timestamp', 'asc'));

                if (messagesUnsubscribe) messagesUnsubscribe();

                messagesUnsubscribe = onSnapshot(qMsg, (snapshot) => {
                    snapshot.docChanges().forEach((change) => {
                        if (change.type === "added") {
                            const msg = change.doc.data();
                            
                            // Track participant for autocomplete
                            if (msg.senderDisplayName) {
                                activeRadioParticipants.add(msg.senderDisplayName);
                            }

                            let senderName = msg.senderDisplayName || 'UNKNOWN';
                            if (msg.senderId === currentUser.uid) senderName = 'ME';
                            
                            // Check for host flag
                            if (msg.isHost) {
                                senderName += ' (*)';
                            }
                            
                            addMessage(senderName, msg.text, false, false, false, msg.isAscii || false, change.doc.id, msg.burn, true);
                        }
                    });
                }, (error) => {
                     if(error.message.includes("index")) {
                         addMessage('ERROR', 'INDEX REQUIRED. Check console.', false, false, true);
                         console.error(error);
                     }
                });

            } catch (error) {
                addMessage('ERROR', 'RADIO ERROR: ' + error.message, false, false, true);
            }
        }
        
        function getConversationId(uid1, uid2) {
            return [uid1, uid2].sort().join('_');
        }