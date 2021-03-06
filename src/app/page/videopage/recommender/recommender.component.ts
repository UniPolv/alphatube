import { Component, OnInit, ViewEncapsulation, HostListener} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CarouselConfig } from 'ngx-bootstrap/carousel';

import { AlphalistService } from '../../../services/alphalist/alphalist.service';
import { YoutubeService } from '../../../services/youtube/youtube.service';
import { SimilarityService } from '../../../services/similarity/similarity.service';

@Component({
  selector: 'app-recommender',
  templateUrl: './recommender.component.html',
  styleUrls: ['./recommender.component.css'],
  encapsulation: ViewEncapsulation.None,
  providers: [
    { provide: CarouselConfig, useValue: { interval: 10000, noPause: false, showIndicators: true } }
  ]

})

export class RecommenderComponent implements OnInit {

  nVideo = 12;
  r10s: any;

  constructor(
    private route: ActivatedRoute,
    private ytService: YoutubeService,
    private alphalistService: AlphalistService,
    private similarity: SimilarityService
  ) { }

  ngOnInit() {
    this.route.params.subscribe( params => {
      this.r10s = {};

      // random
      const idPlay = { // playlist possibili
        playlists: [
          {'playlistId': 'PLUg_BxrbJNY5gHrKsCsyon6vgJhxs72AH'},
          {'playlistId': 'PLVXq77mXV53-Np39jM456si2PeTrEm9Mj'},
          {'playlistId': 'PLTAOP-hZyrHtWfeOJVAvoN5OnuzNNQ0Yw'},
          {'playlistId': 'PLTDluH66q5mpm-Bsq3GlwjMOHITt2bwXE'},
          {'playlistId': 'PLS_oEMUyvA728OZPmF9WPKjsGtfC75LiN'},
          {'playlistId': 'PLLMA7Sh3JsOQQFAtj1no-_keicrqjEZDm'},
          {'playlistId': 'PLq-ZRVZ1W4Fesh7aKXj8np40uUZJTGBmR'},
          {'playlistId': 'PLA-94DyrXTGigxYXPXnRXDDSZ-K0sJxMn'},
          {'playlistId': 'PLC0w3lEHx2SF3NsbnqnLbWBWyF_3g0cjZ'},
          {'playlistId': 'PLmuBNwnyyiySB56boer3K2a5B83CqUjA4'},
          {'playlistId': 'PLGdZ-INw7mfA3VjyfA0I24xhEuh8UuZWa'}
        ]
      };

      // id playlist casuale da playlists
      let idPlaytmp = idPlay.playlists[Math.floor(Math.random() * idPlay.playlists.length)].playlistId;
      this.ytService.getPlaylist(idPlaytmp).toPromise().then(
        // data sono i 30 video presi dalla playlist, tramite getPlaylist da youtube.service
        (data: any) => {
            let randomListVideoId = [];
            let i = 0;
            //finche' non sono stati inseriti 20 video
            while(i < 20 && data.items.length !== 0 ){
              //metto dentro all'array degli id dei video, id di video casuali tramite data.items
              randomListVideoId[i] = data.items.splice(Math.floor(Math.random() * data.items.length), 1)[0].snippet.resourceId.videoId;
              i = i+1;
            }
            this.getVideoInfo('Random',randomListVideoId,[]);
        }
      );


      // search
      if (localStorage.q) {
        this.ytService.getRecommenders({q: localStorage.q, maxResults: 10}).toPromise().then(  // as requested results are < 10
          (data: any) => {
            var tmpSearch = this.ytService.fromYT(data).filter(
              obj => obj.videoID !== params.videoId
            );
            if (tmpSearch.length) this.r10s['Search'] = tmpSearch;
          },
          error => window.alert('There is an error: please reload page!')
        );
      }

      // related
      this.ytService.getRecommenders({relatedToVideoId: params.videoId, maxResults: this.nVideo}).toPromise().then(
        (data: any) => {
           let tmpRel = this.ytService.fromYT(data).filter(
             obj => obj.videoID !== params.videoId
           );
           if (tmpRel.length != 0) this.r10s['Related'] = tmpRel;
        },
        error => console.log(error)
      );

      // recent
      // salvo in lastWatched le stringhe parsate in JSON di localStorage
      try {
        let lastWatched = JSON.parse(localStorage.getItem('lastWatched'));
        if (lastWatched.length !=0){ //se lastWatched contiene qualcosa
          this.getVideoInfo('Recent',lastWatched,params.videoId);
        }
      } catch {}


      // fvitali
      this.alphalistService.getFV(params.videoId).toPromise().then(
        (data: any) => {
          let idList = [];
          for (let i in data.recommended.slice(0,30)){
            idList[i]=data.recommended[i].videoID;
            data.recommended[i]=this.adjustAlphaList(data.recommended[i]);
          }
          this.getVideoInfo('Fvitali',idList,data.recommended);
        },
        error => console.log(error)
      );


      // popularity
      this.alphalistService.getList().toPromise().then( // Per quando globpopList.json sara' disponibile sul sito
        (data: any) =>{
          this.popularity('AbsGlobalPopularity', undefined, data.globpop);
          this.popularity('RelGlobalPopularity',params.videoId, data.globpop);
        },
        error => {/*console.log(error)*/}
      );

      this.popularity('AbsLocalPopularity',undefined, ['1826']);
      this.popularity('RelLocalPopularity',params.videoId, ['1826']);


      // artist similarity

      this.similarity.getArtist().subscribe(
        (data: any) => {
          if (data) {
            this.ytService.getRecommenders({q: data}).toPromise().then(
              (obj: any) => {
                let tmpArtist = this.ytService.fromYT(obj).filter(
                  obj => obj.videoID !== params.videoId)
                if (tmpArtist.length != 0) this.r10s['ArtistSimilarity'] = tmpArtist;
              },
              error => console.log(error)
            );
          }
        },
        error => console.log(error)
      );

      // genere similarity
      this.similarity.getGenere().subscribe(
        (data: any) => {
          if (data){
            this.ytService.getRecommenders({q: data}).toPromise().then(
              (obj: any) => {
                 let tmpSim = this.ytService.fromYT(obj).filter(
                   obj => obj.videoID !== params.videoId);
                 if(tmpSim.length != 0) this.r10s['GenereSimilarity'] = tmpSim;
              },
              error => console.log(error)
            );
          }
        },
        error => console.log(error)
      );
    });
  }

  getVideoInfo(recommender: string, idList: any, reasonList:any){
    this.ytService.getVideo(idList.join()).toPromise().then( // joins all the elements of an array into a string
      (data: any) => {
        data = this.ytService.fromYT(this.ytService.filterVideo(data));
        // E' possibile che getVideo e filterVideo tolgano alcuni video perchè non riproducibili, quindi la posizione nell'array non corrirsponde alla vecchia posizione

        // Se è rel pop o Fvitali mette come ragione prevalentReason
        if (recommender == 'Fvitali' || recommender == 'RelGlobalPopularity' || recommender == 'RelLocalPopularity'){
          for (let i in data){ data[i].reason = 'Prevalent reason: ' + reasonList.filter( elem => elem.videoId == data[i].videoID)[0].prevalentReason;}
        }
        // Se è absolute pop mette come ragione le views
        else if (recommender == 'AbsGlobalPopularity' || recommender == 'AbsLocalPopularity' ) {
          for (let i in data){ data[i].reason = reasonList.filter( elem => elem.videoId == data[i].videoID)[0].timesWatched + ' times watched';}
        }
        // Se è recent bisogna di evitare che venga proposto lo stesso video che si sta guardando
        else if (recommender == 'Recent') {
          data = data.filter( obj => obj.videoID != reasonList);
        }

        if (data.length != 0) this.r10s[recommender] = data;
      },
      error => console.log(error)
    );
  }

  // Ottiene i json dalle API del proj e aggiunge i dati in popList
  popularity(recommender:string, query:string, siteCode:any){
    let siteNumber=siteCode.length, popList = [];
    for(let i in siteCode){
      this.alphalistService.getGlobpop(siteCode[i],query).toPromise().then(
        (data: any) => {
          for(let i in data.recommended){ this.addList(popList, data.recommended[i]);}
          siteNumber = this.finalizePop(popList,siteNumber,recommender);
        },
        error => { /*console.log(error);*/ siteNumber = this.finalizePop(popList,siteNumber,recommender);}
      );
    }
  }

  // Cerca se un video è gia presente nella lista se lo trova aumenta le views, altrimenti lo aggiunge
  addList(videoList: any, video: any){
    // Alcune API ritornano videoID al posto di videoId, adjustAlphaList() sistema questo problema
    if(!video.videoId) video = this.adjustAlphaList(video);
    for (let i = 0; i<videoList.length && video; i++){
      if (videoList[i].videoId == video.videoId) {
        videoList[i].timesWatched = videoList[i].timesWatched + video.timesWatched;
        video = null;
      }
    }
    if (video) videoList.push(video);
  }

  // Ordina la lista in base alle views, richiede a YT le info dei primi 15 video e li aggiunge nel recommender dedicato
  finalizePop(videoList: any, nSite:any, recommender:any){
    nSite--;
    // Entra a fare la richiesta a YT solo se la lista e completa e contiene le informazioni di tutte le API
    if (nSite <= 0){
      // Ordinamento lista per visualizzazioni
      videoList = videoList.sort((n1,n2) => {
        if (n1.timesWatched < n2.timesWatched) return 1;
        else if (n1.timesWatched > n2.timesWatched) return -1;
        return 0;
      });

      let popIdList = [];
      videoList = videoList.splice(0,15);
      for(let i in videoList){ popIdList[i] = videoList[i].videoId;}

      this.getVideoInfo(recommender, popIdList, videoList);
    }
    return nSite;
  }

  // Alcuni recommender ritornano videoID al posto di videoId, adjustAlphaList sistema questo problema
  adjustAlphaList(data: any){
    return{
      videoId: data.videoID,
      timesWatched: data.timesWatched,
      prevalentReason: data.prevalentReason,
      lastSelected: data.lastSelected
    }
  }

}
