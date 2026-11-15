package com.telecarsee.demo

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import io.livekit.android.LiveKit
import io.livekit.android.room.Room
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import kotlinx.coroutines.*
import okhttp3.*
import org.json.JSONObject
import java.util.Locale
import kotlin.math.sin

private val Bg=Color(0xFF101B27)
private val Panel=Color(0xFF1C2C3B)
private val Mint=Color(0xFF71E6C5)
private val Soft=Color(0xFFB4C6D0)
private val Red=Color(0xFFD95061)

class MainActivity : ComponentActivity() {
    private var stage by mutableStateOf("offline")
    private var message by mutableStateOf("서버에 연결하고 있습니다.")
    private var nearby by mutableIntStateOf(0)
    private var available by mutableStateOf(true)
    private var muted by mutableStateOf(false)
    private var seconds by mutableIntStateOf(0)
    private var receivedBytes=0L
    private var sentBytes=0L
    private var profile by mutableStateOf("A")
    private var voiceStatus by mutableStateOf("음성 제어 확인 중")
    private var ttsStatus by mutableStateOf("안내음 초기화 중")
    private var settings by mutableStateOf(false)
    private var listening by mutableStateOf(false)
    private var serverAddress by mutableStateOf("ws://127.0.0.1:8787/ws")
    private var callId: String?=null
    private var socket: WebSocket?=null
    private var room: Room?=null
    private var mediaJob: Job?=null
    private var eventJob: Job?=null
    private var heartbeat: Job?=null
    private var timer: Job?=null
    private var reconnect: Job?=null
    private var closed=false
    private var recognizer: SpeechRecognizer?=null
    private var restoreMicAfterRecognition=false
    private var pendingPermissionAction: String?=null
    private var pleosTts: ai.pleos.playground.tts.TextToSpeech?=null
    private var androidTts: android.speech.tts.TextToSpeech?=null
    private var ttsReady=false
    private val client=OkHttpClient.Builder().pingInterval(10,java.util.concurrent.TimeUnit.SECONDS).build()
    private val permission=registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val action=pendingPermissionAction;pendingPermissionAction=null
        if(granted) when(action) { "request" -> requestCall(); "accept" -> accept(); "listen" -> listen() }
        else message="실제 통화를 위해 마이크 권한이 필요합니다."
    }
    private val audio by lazy { getSystemService(AUDIO_SERVICE) as AudioManager }
    private val focus by lazy {
        AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            .setOnAudioFocusChangeListener { change ->
                if(change==AudioManager.AUDIOFOCUS_LOSS || change==AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                    lifecycleScope.launch { stopCall(); message="다른 차량 오디오가 우선되어 통화를 종료했습니다." }
                }
            }.build()
    }

    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val prefs=getPreferences(MODE_PRIVATE)
        profile=intent.getStringExtra("profile") ?: prefs.getString("profile","A")!!
        serverAddress=intent.getStringExtra("server") ?: prefs.getString("server",serverAddress)!!
        setupSpeech()
        connect()
        setContent { MaterialTheme(colorScheme=darkColorScheme(primary=Mint,background=Bg,surface=Panel)) { DemoScreen() } }
    }
    private fun connect() {
        socket?.cancel(); reconnect?.cancel(); heartbeat?.cancel()
        stage="offline"; message="로컬 매칭 서버에 연결하고 있습니다."
        socket=client.newWebSocket(Request.Builder().url(serverAddress).build(),object:WebSocketListener() {
            override fun onOpen(ws:WebSocket,response:Response) { ws.send(JSONObject().put("type","join").put("profile",profile).toString()) }
            override fun onMessage(ws:WebSocket,text:String) { lifecycleScope.launch { if(socket===ws) handle(JSONObject(text)) } }
            override fun onFailure(ws:WebSocket,t:Throwable,response:Response?) { lifecycleScope.launch { if(socket===ws) disconnected() } }
            override fun onClosed(ws:WebSocket,code:Int,reason:String) { lifecycleScope.launch { if(socket===ws) disconnected() } }
        })
    }
    private fun disconnected() {
        clearMedia(); stage="offline"; callId=null; nearby=0
        message="서버 연결이 끊어졌습니다. 자동으로 다시 연결합니다."
        heartbeat?.cancel()
        if(!closed) { reconnect?.cancel(); reconnect=lifecycleScope.launch { delay(3000); connect() } }
    }
    private fun send(type:String,build:(JSONObject)->Unit={}) {
        val json=JSONObject().put("type",type); callId?.let { json.put("callId",it) }; build(json)
        if(socket?.send(json.toString())!=true) message="서버에 연결되지 않았습니다."
    }
    private fun handle(e:JSONObject) {
        when(e.getString("type")) {
            "hello" -> { stage="ready"; message="같은 도로·방향의 참여자를 찾아 연결합니다."; heartbeat=lifecycleScope.launch { while(isActive) { delay(5000); send("ping") } } }
            "snapshot" -> { nearby=e.optInt("nearby"); available=e.optBoolean("available",true) }
            "outgoing" -> { stage="outgoing"; callId=e.getString("callId"); message="상대가 수락하면 목소리가 전달됩니다."; speak("주변 참여자에게 연결을 요청했습니다.") }
            "incoming" -> { stage="incoming"; callId=e.getString("callId"); message="수락하면 실제 목소리로 통화합니다."; speak("주변 차량에서 연결 요청이 왔습니다. 연결할까요?") }
            "connecting" -> { stage="connecting"; callId=e.getString("callId"); message="상대의 수락을 확인했습니다. 음성을 연결합니다." }
            "media" -> connectMedia(e)
            "active" -> { stage="in_call"; message="실제 목소리가 전달되고 있습니다."; timer?.cancel(); seconds=0;receivedBytes=0;sentBytes=0; timer=lifecycleScope.launch { while(isActive) { delay(1000); seconds++;collectMediaStats() } } }
            "ended" -> { clearMedia(); callId=null; stage="ended"; message=e.optString("message","대화가 종료됐습니다."); speak(message) }
            "notice" -> { message=e.optString("message"); speak(message) }
        }
    }
    private fun connectMedia(e:JSONObject) {
        val id=e.getString("callId")
        if(callId!=id) return
        mediaJob?.cancel()
        mediaJob=lifecycleScope.launch {
            try {
                if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) throw IllegalStateException("microphone permission")
                androidTts?.stop();pleosTts?.stop()
                if(audio.requestAudioFocus(focus)!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED) throw IllegalStateException("audio focus denied")
                val r=LiveKit.create(applicationContext)
                // The app owns the focus request; a second SDK request would revoke it.
                r.audioSwitchHandler?.manageAudioFocus=false
                room=r
                eventJob=launch { r.events.collect { event ->
                    if(event is RoomEvent.Disconnected && callId==id) { send("media_error"); clearMedia(); stage="ended"; message="음성 연결이 끊어졌습니다." }
                } }
                r.connect(e.getString("url"),e.getString("token"))
                if(callId!=id) { r.disconnect();return@launch }
                r.localParticipant.setMicrophoneEnabled(true)
                muted=false;send("connected")
            } catch(c:CancellationException) { throw c }
            catch(error:Exception) { android.util.Log.e("TelecarDemo","Media setup failed: ${error.javaClass.simpleName}");send("media_error"); clearMedia(); stage="ended"; message="마이크와 음성 서버 연결을 확인해주세요." }
        }
    }
    private fun clearMedia() {
        timer?.cancel();mediaJob?.cancel();eventJob?.cancel()
        room?.disconnect();room?.release();room=null;muted=false
        audio.abandonAudioFocusRequest(focus)
    }
    private fun collectMediaStats() {
        val r=room ?: return
        r.getSubscriberRTCStats { report ->
            receivedBytes=report.statsMap.values.filter { it.type=="inbound-rtp" && (it.members["kind"]=="audio" || it.members["mediaType"]=="audio") }.sumOf { (it.members["bytesReceived"] as? Number)?.toLong() ?: 0 }
        }
        r.getPublisherRTCStats { report ->
            sentBytes=report.statsMap.values.filter { it.type=="outbound-rtp" && (it.members["kind"]=="audio" || it.members["mediaType"]=="audio") }.sumOf { (it.members["bytesSent"] as? Number)?.toLong() ?: 0 }
            // Only packet counters; no voice content or location is written.
            runCatching { java.io.File(getExternalFilesDir(null),"media-metrics.json").writeText(JSONObject().put("receivedAudioBytes",receivedBytes).put("sentAudioBytes",sentBytes).put("seconds",seconds).put("muted",muted).put("pleosTtsReady",ttsReady).toString()) }
        }
    }
    private fun stopCall() { send("end");clearMedia();callId=null;stage="ended";message="대화가 종료됐습니다." }
    private fun requestCall() {
        if(stage=="offline") { connect();return }
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) { pendingPermissionAction="request";permission.launch(Manifest.permission.RECORD_AUDIO);return }
        send("request");message="주변 참여자를 찾고 있습니다."
    }
    private fun accept() {
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) { pendingPermissionAction="accept";permission.launch(Manifest.permission.RECORD_AUDIO);return }
        send("accept")
    }
    private fun mute() { lifecycleScope.launch { val r=room ?: return@launch; try { r.localParticipant.setMicrophoneEnabled(muted);muted=!muted } catch(_:Exception) { message="마이크 상태를 변경하지 못했습니다." } } }

    private fun setupSpeech() {
        voiceStatus=if(SpeechRecognizer.isRecognitionAvailable(this)) "Android 음성 제어 · Gleo 미연동" else "음성 제어 미지원 · 터치로 시연"
        androidTts=android.speech.tts.TextToSpeech(this) { status -> if(status==android.speech.tts.TextToSpeech.SUCCESS) { androidTts?.language=Locale.KOREA } }
        try {
            val t=ai.pleos.playground.tts.TextToSpeech(applicationContext,ai.pleos.playground.tts.constant.Mode.ON_DEVICE)
            pleosTts=t
            t.initialize(object:ai.pleos.playground.tts.listener.OnInitializeListener {
                override fun onSuccess() { lifecycleScope.launch { ttsReady=true;ttsStatus="Pleos TTS 연결됨"; t.setLocale(Locale.KOREA) } }
                override fun onFailure(errorType:ai.pleos.playground.tts.constant.ErrorType) { lifecycleScope.launch { ttsStatus="Pleos TTS 미연결 · Android 안내음" } }
            })
        } catch(_:Throwable) { ttsStatus="Pleos TTS 미연결 · Android 안내음" }
    }
    private fun speak(text:String) {
        // Do not interrupt a real conversation with state announcements.
        if(stage=="in_call" || stage=="connecting") return
        if(ttsReady) { try { pleosTts?.speak(text);return } catch(_:Throwable) { ttsReady=false } }
        androidTts?.speak(text,android.speech.tts.TextToSpeech.QUEUE_FLUSH,null,"state")
    }
    private fun listen() {
        if(!SpeechRecognizer.isRecognitionAvailable(this)) { message="이 환경은 음성 인식을 제공하지 않습니다. 화면 버튼으로 시연하세요.";return }
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) {pendingPermissionAction="listen";permission.launch(Manifest.permission.RECORD_AUDIO);return}
        lifecycleScope.launch {
            restoreMicAfterRecognition=stage=="in_call" && !muted
            if(restoreMicAfterRecognition) room?.localParticipant?.setMicrophoneEnabled(false)
            androidTts?.stop();pleosTts?.stop()
            recognizer?.destroy();recognizer=SpeechRecognizer.createSpeechRecognizer(this@MainActivity)
            recognizer?.setRecognitionListener(object:RecognitionListener {
                override fun onReadyForSpeech(p:Bundle?) { listening=true }
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(v:Float) {}
                override fun onBufferReceived(b:ByteArray?) {}
                override fun onEndOfSpeech() { listening=false }
                override fun onError(error:Int) { listening=false;message="음성을 인식하지 못했습니다. 다시 시도하거나 버튼을 사용하세요."; restoreMic() }
                override fun onResults(results:Bundle?) {
                    listening=false
                    val text=results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                    when {
                        text.contains("종료") || text.contains("취소") -> stopCall()
                        text.contains("거절") && stage=="incoming" -> send("decline")
                        text.contains("음소거") && stage=="in_call" -> { restoreMicAfterRecognition=false; lifecycleScope.launch { room?.localParticipant?.setMicrophoneEnabled(false);muted=true } }
                        text.contains("연결") -> if(stage=="incoming") accept() else if(stage=="ready" || stage=="ended") requestCall()
                        else -> message="연결, 거절, 음소거, 통화 종료라고 말해주세요."
                    }
                    restoreMic()
                }
                override fun onPartialResults(p:Bundle?) {}
                override fun onEvent(t:Int,p:Bundle?) {}
            })
            recognizer?.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(RecognizerIntent.EXTRA_LANGUAGE,"ko-KR").putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM))
        }
    }
    private fun restoreMic() { if(restoreMicAfterRecognition) lifecycleScope.launch { runCatching { room?.localParticipant?.setMicrophoneEnabled(true) };restoreMicAfterRecognition=false } }

    @Composable private fun DemoScreen() {
        BoxWithConstraints(Modifier.fillMaxSize().background(Bg).padding(24.dp)) {
            val large=maxWidth>1100.dp
            val titleSize=if(large) 44.sp else 30.sp
            Column(Modifier.fillMaxSize(),verticalArrangement=Arrangement.spacedBy(14.dp)) {
                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
                    Text("텔레",fontSize=27.sp,fontWeight=FontWeight.Bold,color=Color.White)
                    Text("CAR",fontSize=27.sp,fontWeight=FontWeight.Bold,color=Mint)
                    Text("시",fontSize=27.sp,fontWeight=FontWeight.Bold,color=Color.White)
                    Spacer(Modifier.width(18.dp))
                    Text("DEMO · 가상 위치 / 실제 음성",color=Mint,fontSize=14.sp)
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick={if(stage !in listOf("in_call","connecting","incoming","outgoing"))settings=true}) { Text("차량 $profile · 설정",color=Soft,fontSize=18.sp) }
                }
                HorizontalDivider(color=Color(0xFF304454))
                Row(Modifier.weight(1f).fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(32.dp)) {
                    Box(Modifier.weight(.38f).fillMaxHeight(),contentAlignment=Alignment.Center) { Radar(stage) }
                    Column(Modifier.weight(.62f),verticalArrangement=Arrangement.spacedBy(18.dp)) {
                        Text(when(stage){"offline"->"서버 연결 중";"outgoing"->"연결 응답을\n기다리고 있어요";"incoming"->"주변 운전자에게서\n연결 요청이 왔어요";"connecting"->"음성을 연결하고 있어요";"in_call"->"주변 운전자와 대화 중";"ended"->"대화 대기";else->"주변 운전자와 연결"},fontSize=titleSize,lineHeight=titleSize*1.25,fontWeight=FontWeight.Bold,color=Color.White)
                        Text(if(stage=="in_call") String.format(Locale.US,"%02d:%02d",seconds/60,seconds%60) else message,color=Soft,fontSize=if(large) 25.sp else 18.sp)
                        if(stage in listOf("ready","ended")) {
                            Text("반경 500m · 같은 도로·방향 · $nearby 명 대화 가능",color=Mint,fontSize=18.sp)
                            Action("주변 차량 연결",onClick={requestCall()})
                            Row(verticalAlignment=Alignment.CenterVertically) { Switch(checked=available,onCheckedChange={send("available"){e->e.put("value",it)}});Spacer(Modifier.width(12.dp));Text("대화 요청 받기",color=Soft,fontSize=18.sp) }
                        }
                        if(stage=="incoming") Row(horizontalArrangement=Arrangement.spacedBy(14.dp)) {
                            Action("거절",Modifier.weight(1f),Panel){send("decline")};Action("연결",Modifier.weight(1f)){accept()}
                        }
                        if(stage=="outgoing" || stage=="connecting") Action("연결 취소",fill=Panel){stopCall()}
                        if(stage=="in_call") Row(horizontalArrangement=Arrangement.spacedBy(14.dp)) {
                            Action(if(muted)"마이크 켜기" else "음소거",Modifier.weight(1f),Panel){mute()}
                            Action("통화 종료",Modifier.weight(1f),Red){stopCall()}
                        }
                        if(stage=="offline") Action("서버 다시 연결",fill=Panel){connect()}
                    }
                }
                Row(Modifier.fillMaxWidth().background(Panel,RoundedCornerShape(14.dp)).padding(horizontal=18.dp,vertical=8.dp),verticalAlignment=Alignment.CenterVertically) {
                    Text(if(listening)"듣고 있습니다…" else voiceStatus,color=Soft,fontSize=15.sp,modifier=Modifier.weight(1f))
                    TextButton(onClick={listen()}) {Text("음성 입력",color=Mint,fontSize=18.sp)}
                }
                Text("$ttsStatus · FusedLocation / Gleo 미연동 · 정지된 개발 환경 시연",color=Soft.copy(alpha=.7f),fontSize=12.sp)
            }
        }
        if(settings) SettingsDialog()
    }
    @Composable private fun Action(label:String,modifier:Modifier=Modifier,fill:Color=Mint,onClick:()->Unit) {
        Button(onClick=onClick,modifier=modifier.heightIn(min=68.dp).fillMaxWidth(),shape=RoundedCornerShape(14.dp),colors=ButtonDefaults.buttonColors(containerColor=fill,contentColor=if(fill==Mint)Bg else Color.White)) { Text(label,fontSize=24.sp,fontWeight=FontWeight.SemiBold) }
    }
    @Composable private fun Radar(state:String) {
        Canvas(Modifier.fillMaxWidth().aspectRatio(1f)) {
            val center=Offset(size.width/2,size.height/2);val r=size.minDimension*.35f
            drawCircle(Color(0xFF304454),r,center,style=Stroke(2.dp.toPx()));drawCircle(Color(0xFF304454),r*.7f,center,style=Stroke(2.dp.toPx()))
            drawCircle(Color(0xFF183D3C),r*.44f,center)
            if(state=="in_call") {
                for(i in 0..12) { val h=(12+sin(i.toFloat())*sin(i.toFloat())*50).dp.toPx();val x=center.x+(i-6)*13.dp.toPx();drawLine(Mint,Offset(x,center.y-h/2),Offset(x,center.y+h/2),5.dp.toPx()) }
            } else {
                val carWidth=r*.24f;val carHeight=r*.48f
                drawRoundRect(Mint,Offset(center.x-carWidth/2,center.y-carHeight/2),androidx.compose.ui.geometry.Size(carWidth,carHeight),androidx.compose.ui.geometry.CornerRadius(10.dp.toPx()))
                drawRoundRect(Bg,Offset(center.x-carWidth*.33f,center.y-carHeight*.25f),androidx.compose.ui.geometry.Size(carWidth*.66f,carHeight*.34f),androidx.compose.ui.geometry.CornerRadius(4.dp.toPx()))
                if(state=="ready" || state=="ended") for(p in listOf(Offset(-r*.5f,-r*.85f),Offset(r*.98f,0f),Offset(-r*.67f,r*.7f))) drawCircle(Soft,10.dp.toPx(),center+p)
            }
        }
    }
    @Composable private fun SettingsDialog() {
        var address by remember { mutableStateOf(serverAddress) }
        var selected by remember { mutableStateOf(profile) }
        AlertDialog(onDismissRequest={settings=false},title={Text("로컬 데모 설정")},text={Column(verticalArrangement=Arrangement.spacedBy(12.dp)) {
            Text("A·B는 같은 범위, C는 범위 밖, D는 반대 방향입니다.")
            Row { for(p in listOf("A","B","C","D")) TextButton(onClick={selected=p}) {Text(if(selected==p)"● $p" else p)} }
            OutlinedTextField(value=address,onValueChange={address=it},label={Text("WebSocket 서버 주소")})
            Text("가상 위치로 매칭합니다. Pleos SDK 승인과 주행 중 사용은 별도 검증이 필요합니다.",fontSize=13.sp)
        }},confirmButton={TextButton(onClick={
            if(!address.startsWith("ws://") && !address.startsWith("wss://")) {message="서버 주소는 ws:// 또는 wss://로 시작해야 합니다.";return@TextButton}
            profile=selected;serverAddress=address;getPreferences(MODE_PRIVATE).edit().putString("profile",profile).putString("server",address).apply();settings=false;connect()
        }){Text("적용")}},dismissButton={TextButton(onClick={settings=false}){Text("닫기")}})
    }
    override fun onDestroy() {
        closed=true;reconnect?.cancel();heartbeat?.cancel();callId?.let{send("end")};clearMedia();socket?.close(1000,"app closed")
        recognizer?.destroy();pleosTts?.release();androidTts?.shutdown();client.dispatcher.executorService.shutdown()
        super.onDestroy()
    }
}
