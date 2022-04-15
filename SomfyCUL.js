/*
-------------------------------------------------------------------------------------------------------------------------------------------
Script:     SomfyCUL
Version:    0.04
Author:     Kai Schreuder
-------------------------------------------------------------------------------------------------------------------------------------------
Description and hints:
            Connect ioBroker to all(???) our somfy-stuff, wich works with the somfy RTS remote-protocoll on 433MHz.
            You need:
            - ioBroker (functional and running)
            - an (functional and running) instance of ioBroker.cul (https://github.com/ioBroker/ioBroker.cul)
            - a CUL-Stick 433MHz

            There's a way to switch a 8xxMHz Stick to 433MHz, but when i bought my stuff years ago,
            i had serius doubts because the reduced range mentioned in some articles when doing so.
            I wanted to reduce the sources of failure to the absolute minimum.

            This script is heavily based on the ideas and work of other individuals.
            Mostly on the work of user 'chka' here (german language!): https://homematic-forum.de/forum/viewtopic.php?f=37&t=21879
            (I used his tcl-scripts on my old homematic CCU2 for several years.)

            Also thanks to the developers of ioBroker and ioBroker.cul !!!
            Especially https://github.com/hobbyquaker for the first option to use CUL.

            If further individuals should be mentioned personally here: PLS give me a hint!

            This script is tested with the following units and is running w/o any serious probs since then:
            - Centralis uno RTS

            (PLS give a short feedback when you tested it with other devices)

            As far as i know, it's a one-way communication, there's no answer like "i'm closed".
            So, we fire our commands over the air and just hope and assume, that the right action takes place.
            Also there's no command for moving only a certain percentage down for e.g.;
            If we want to achieve this we have to measure the times EACH of our shutters/blinds needs to move down and up.
            (Keep in mind: Moving up consumes more time than down. And: Every device is different due to production tolerances.)
            Based on this measures we can think of some kind of automatic sun-protection in summer ;-)

            Sporadically - maybe once or twice a year - single somfy devices just stop doing anything when a remote-command is issued.
            I have seen this behaviour also, when i used the original somfy remote-control :-(.
            To make them responsive again: Just switch the "auto-mode" off and on again.
            Also single shutters sometimes (very seldom) don't move on the first command issued, therefore i send out the command in
            some other scripts a second time with a delay of ~10 seconds like this:
                setState('javascript.0.SomfyCUL.LogicalShutters.Shutter00.Level', 100); // open xxxx
                setStateDelayed(javascript.0.SomfyCUL.LogicalShutters.Shutter00.Level, 100,  10000); // open xxxx

            Currently you have to modify / extend the script yourself or use another self-written script to register ioBroker as
            a remote-control @ the somfy devices. As the ID i'm using already was registered @ the devices, my focus was on the
            bare movement of the somfys, so the old CCU2 could be switched off.
            There are some Ideas in my mind, but if you have it ready: Feel free to help me out.

            Step 1: Put somfy-device into "learning-mode" (see: somfy-manual!)
            Step 2: Send RAWcommand: "A0" + cmdPROG + RollingCode + [state-value MyRemoteID]

            Example:
            Prog-Command is 80 Hex
            Rolling code should start at 0 for a ID that has never been connected to a certain device.
            our ID is FABB00

            The resulting RAW-code in that case is: YsA0800000FABB00

            If you fire this over the air and did everthing correct, your shutter should answer with a short movement.

            We could also register a single ID to more than one remote somfy-device,
            but for my personal use case i thought that it's not worth the effort.
            Creating groups in the script looks more efficient to me.
            ------------------------------------------------------------------------------------
            Usage in VIS:
            For each shutter / shutter-group i have 3 buttons there:
            Example:
            Up:     Object ID:  javascript.0.SomfyCUL.LogicalShutters.Shutter00.Level
                    Value:      100
            Down:   Object ID:  javascript.0.SomfyCUL.LogicalShutters.Shutter00.Level
                    Value:      0
            Stop:   Object ID:  javascript.0.SomfyCUL.LogicalShutters.Shutter00.Stop
                    Value:      true
-------------------------------------------------------------------------------------------------------------------------------------------


ToDo:
            Implement:  Functions 2 register @ somfy devices
            Implement:  MAYBE(?) different send-repetitions for different devices. See: fSendRawSomfy

History:
            0.04    First public release
-------------------------------------------------------------------------------------------------------------------------------------------
*/


// Instance of CUL-Adapter we want to talk to:
var culAd = 'cul.0';


// Number of command-representations for VIS an logical shutter-groups
// Max: 99 otherwise we have to modify the rest of the script. I didn't really think too much before typing my code ;-)
var LogicalShuttersCount = 16;

// Number of physical devices in the house
// Max: also 99
var PhysicalShuttersCount = 10;

// The part of the ID hex-value that is fix.
// If we have to connect our CUL to the Somfy's at new, we change it here
// For now 2 flexible hex-digits at the end will be enough ;-)
// The resulting ID will then be 'FABBxx' if you define 'FABB' here.
var MyRemoteIDFixedPrefix = 'A000';

// Prefixes for our StateID's
var stPrefixInstanceName = 'javascript.0.'
var stPrefixPhysicalID = 'SomfyCUL.PhysicalShutters.MyRemoteID';
var stPrefixPhysicalRolling = 'SomfyCUL.PhysicalShutters.RollingCode';
var stPrefixLogicalShutters = 'SomfyCUL.LogicalShutters.Shutter';

// Creating the states for our little Script
// with some loops to keep it as short as possible
// As we have nearly everything coded here in the script,
// the only states to save to another location before you delete all states in the object-path
// "javascript.x.SomfyCUL.*" are the rolling codes.
// If you don't have your rolling codes anymore, you have to start from scratch ;-)


for (let loopRemID = 0; loopRemID < PhysicalShuttersCount; loopRemID++) {
    await createStateAsync(stPrefixPhysicalID + loopRemID.toString().padStart(2,"0"), MyRemoteIDFixedPrefix + loopRemID.toString(16).toUpperCase().padStart(2,"0"), {read: true, write: true});
}

for (let loopRolling = 0; loopRolling < PhysicalShuttersCount; loopRolling++) {
    // If you're moving from CCU to javascript like i did, you can copy the last values from your
    // CCU-variables into the state-values after the first start of the script
    await createStateAsync(stPrefixPhysicalRolling + loopRolling.toString().padStart(2,"0"), 0, {read: true, write: true});
}

for (let loopLogi = 0; loopLogi < LogicalShuttersCount; loopLogi++) {
    var StateID = stPrefixLogicalShutters + loopLogi.toString().padStart(2,"0")
    await createStateAsync(StateID + '.Level', -1, {read: true, write: true});
    await createStateAsync(StateID + '.IDNum', "[00]", {read: true, write: true});
    await createStateAsync(StateID + '.ReadableName', "TheNameOrGroupName", {read: true, write: true});
    await createStateAsync(StateID + '.Stop', false, {read: true, write: true, type: 'boolean'});
}

function fsetLogicalSutterValues(logicalShutterIDself, physicalShutters, readableName) {
    // 'logicalShutterIDself' is a string representing a 2 digit number
    // physicalShutters is an array of strings defining wich physical shutters should be moved
    // readableName is a string that we can use a name for debugging a.s.o.
    var StateID = stPrefixInstanceName + stPrefixLogicalShutters + logicalShutterIDself;
    setState(StateID + '.IDNum', physicalShutters);
    setState(StateID + '.ReadableName', readableName);
    return true;
}

var retDummy = false;

// Quick and dirty: Define each logical shutter/blind here.
// We already have created the states before and have to fill them wth data:
retDummy = fsetLogicalSutterValues('00', "[00]", "Represents the first physical shutter");
retDummy = fsetLogicalSutterValues('01', "[01]", "Represents the second physical shutter");
retDummy = fsetLogicalSutterValues('02', "[02]", "Represents the third physical shutter");
retDummy = fsetLogicalSutterValues('03', "[03]", "Represents the fourth physical shutter");
retDummy = fsetLogicalSutterValues('04', "[04]", "Represents the.... ");
retDummy = fsetLogicalSutterValues('05', "[05]", "Represents the.... ");
retDummy = fsetLogicalSutterValues('06', "[06]", "Represents the.... ");
retDummy = fsetLogicalSutterValues('07', "[07]", "Represents the.... ");
retDummy = fsetLogicalSutterValues('08', "[08]", "Represents the.... ");
retDummy = fsetLogicalSutterValues('09', "[09]", "Represents the last physical shutter");
retDummy = fsetLogicalSutterValues('10', "[00, 01, 02]", "The first group of shutters");
retDummy = fsetLogicalSutterValues('11', "[03, 04]", "The second group of shutters");
retDummy = fsetLogicalSutterValues('12', "[05, 06, 07]", "The third group of shutters");
retDummy = fsetLogicalSutterValues('13', "[00, 01, 02, 03, 04, 05, 06, 07]", "and so on");
retDummy = fsetLogicalSutterValues('14', "[03, 04, 08, 09]", "Another Group");
retDummy = fsetLogicalSutterValues('15', "[00, 01, 02, 03, 04, 05, 06, 07, 08, 09]", "All shutters");


/*
I use 2 Arrays for subscription, because the use of
$('channel[state.id=javascript.0.SomfyCUL.LogicalShutters.Shutter*.Level]')
produced always 2 identical triggers for a single click in VIS and a repeated click in VIS on the same button
did nothing, because the state-value didn't change. BUT i want to have the option to issue my command >1 time(s),
because under very rare conditions the somfy shutters don't move @ the first command
AND if the rolling code in IOB is out of the devices's "window" i can click in VIS until the shutter moves again.
I had no intention to dig deeper and this works pretty nice ....
*/

var idCountFirst = 0;   // we could als exclude physical shutter 1-2 here ;-)
var idCountLast = LogicalShuttersCount - 1;

var idShuttersLevel = [];
var idShuttersStop = [];
for (let idNum = idCountFirst; idNum <= idCountLast; idNum++) {
    idShuttersLevel.push(stPrefixInstanceName + stPrefixLogicalShutters + idNum.toString().padStart(2,"0") + ".Level");
    idShuttersStop.push(stPrefixInstanceName + stPrefixLogicalShutters + idNum.toString().padStart(2,"0") + ".Stop");
}


// Keep in mind: we are working with our logical shutters
// Move the shutters, up/down when a VIS-Button (for e.g.) is pressed
on({id: idShuttersLevel}, function (obj) {
    var objParent = obj.id.replace(".Level", ".");
    var stLevel = "" + obj.state.val;
    if (stLevel != "-1") {
        var stIDNum = [];
        stIDNum = getState(objParent + "IDNum").val.split(",");
        //console.log ("Level: " + obj.state.val);
        //console.log ("IDNum: " + stIDNum)
        //console.log ("ReadableName: " + getState(objParent + "ReadableName").val)
        for (let loop = 0; loop < stIDNum.length; loop++) {
            var IDNum = stIDNum[loop].replace("[","").replace("]", "").replace(" ","");
            var DummyRet = fSendRawSomfy(IDNum, stLevel);
        }
    }
});

// Stop the movement, when a VIS-Button (for e.g.) is pressed
on({id: idShuttersStop}, function (obj) {
    var objParent = obj.id.replace(".Stop", ".");
    if (obj.state.val === true){
        var stLevel = "stop";
    } else {
        var stLevel = "";
    }
    if (stLevel != "") {
        var stIDNum = [];
        stIDNum = getState(objParent + "IDNum").val.split(",");
        //console.log ("Level: " + stLevel);
        //console.log ("IDNum: " + stIDNum)
        //console.log ("ReadableName: " + getState(objParent + "ReadableName").val)
        setState(obj.id,false);
        for (let loop = 0; loop < stIDNum.length; loop++) {
            var IDNum = stIDNum[loop].replace("[","").replace("]", "").replace(" ","");
            var DummyRet = fSendRawSomfy(IDNum, stLevel);
        }
    }
});


function fSendRawSomfy(stDeviceNum, stCommand) {
    var return_val = false;

    // First Step is: Always set the number of send-repetitions on the CUL-stick to 1.
    // My Somfy Centralis uno RTS don't accept any commands if the CUL sends the command more often during one "session"
    // I've read that others had to vary the number of repetitions for different somfy devices.
    // Their "standard" of 3 didn't work for my devices.
    var stRepeat = "Yr1";
    var stRawCommand = fBuildRawSomfy(stDeviceNum, stCommand);

    //console.log(stRepeat);
    sendTo(culAd, "sendraw", {"command": stRepeat});
    //console.log(stRawCommand);
    sendTo(culAd, "sendraw", {"command": stRawCommand});

    // Increment the rolling code
    var incVal = fIncRolling(stDeviceNum);

    return_val = true;
    return return_val;
}


function fIncRolling(stDeviceNum) {
    // Increment the rolling code
    var return_val = -1;
    return_val = getState(stPrefixInstanceName + stPrefixPhysicalRolling + stDeviceNum).val;
    ++return_val;
    setState(stPrefixInstanceName + stPrefixPhysicalRolling + stDeviceNum, return_val);
    return return_val;
}

function fBuildRawSomfy(stDeviceNum, stCommand) {
    var return_val = "";

    stRolling = stPrefixInstanceName + stPrefixPhysicalRolling + stDeviceNum
    stMyRemID = stPrefixInstanceName + stPrefixPhysicalID + stDeviceNum

    return_val = "Ys" + "A0" + fCommandToHexCode(stCommand) + fNum2HexFromStateID(stRolling) + getState(stMyRemID).val;
    return return_val;
}


function fCommandToHexCode(txCommand) {
    var device_cmd_hex = "10";

    switch (txCommand) {
    case 'OPEN', 'open', '100':
        device_cmd_hex = "20";
        break;
    case 'CLOSE', 'close', '0':
        device_cmd_hex = "40";
        break;
    case 'PROG', 'prog':
        device_cmd_hex = "80";
        break;
    case 'MY', 'my':
        device_cmd_hex = "10"; // does not work with centralis uno RTS
        break;
    case 'STOP', 'stop':
        device_cmd_hex = "11";
        break;
    default:
        device_cmd_hex = "10"; // before we do something else, we do something where we assume it's not harmfull
        break;
    }

    return device_cmd_hex;
}


function fNum2HexFromStateID(fullStateID) {
    var return_val = "";
    return_val = getState(fullStateID).val.toString(16).toUpperCase().padStart(4,"0");
    return return_val;
}
