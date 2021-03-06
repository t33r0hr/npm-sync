import { Observable } from 'rxjs/Observable'
import 'rxjs/add/operator/mergeMap'
import 'rxjs/add/operator/mapTo'
import 'rxjs/add/operator/concat'
import 'rxjs/add/observable/fromPromise'

import * as Rsync from 'rsync'


import { NpmPackage } from '../package.class'
import { IPackageInfo } from '../../interfaces/package-info'
import * as path from 'path'
import * as fsUtils from '../../utils/fs'
import { untar } from '../../utils/tar'
import * as rsync from 'rsync'

import { log, debug } from '../../log/log'
import { syncToPackage, packPackage } from '../actions/sync'


export class LocalNpmPackage extends NpmPackage implements IPackageInfo {

  constructor(source:string){
    super(source)
    const info:IPackageInfo = this.readPackageInfo()
    
    this.name = info.name
    this.version = info.version
    this.dependencies = info.dependencies
    this.devDependencies = info.devDependencies
    this.peerDependencies = info.peerDependencies
  }

  readonly name:string

  readonly version:string

  readonly dependencies:any
  
  readonly devDependencies:any
  
  readonly peerDependencies:any

  readonly dependencyPackages:Observable<LocalNpmPackage>


  protected readPackageInfo ():IPackageInfo {
    return require(path.join(this.source,'package.json'))
  }

  unpackTmp () {

    return Observable.fromPromise(fsUtils.mktmpdir(`${this.name}@${this.version}`))
      .mergeMap ( tmpDirectory => {

        return untar(this.pack(),tmpDirectory).toArray().mapTo(path.join(tmpDirectory,'package'))
      } )

  }

  deleteTmp (tmpDirectory:string) {
    const tmp = tmpDirectory.replace(/package$/,'')
    return fsUtils.rm(tmp,'-rf')
  }

  syncToPackage ( tmpDirectory:string, targetPath:string|NpmPackage, sourcePackageName:string=this.name ) {

    if ( targetPath instanceof NpmPackage ) {
      return this.syncToPackage(tmpDirectory,targetPath.source,sourcePackageName)
    }
      
    const p = path.join(targetPath,'node_modules',sourcePackageName)

    log('installing package at "%s"', p)    
    
    const rs = new rsync().flags('avzh').source(tmpDirectory+'/.').destination(p).delete()

    return new Promise((resolve,reject)=>{

      rs.execute((error:Error,code:number)=>{
        error ? reject(error) : resolve(p)
      })

    })

  }

  syncToPackages ( ...targetPackages:LocalNpmPackage[] ) {

    return syncToPackage ( this.source, targetPackages.map ( p => p.source ) )

  }

  syncNodeModulesToPackage ( targetPackage:LocalNpmPackage ) {
    const sourcePackageNames = this.dependencyPackages.map ( p => p.name ).toArray()
    const targetPackageNames = targetPackage.dependencyPackages.map ( p => p.name ).toArray()

    return Observable.zip(sourcePackageNames,targetPackageNames).mergeMap ( ([sourcePackages,targetPackages]:[string[],string[]]) => {
      return sourcePackages.filter ( sourcePackage => targetPackages.indexOf(sourcePackage) === -1 )
    } )
    .concatMap ( missingPackageName => {
      return syncToPackage(path.join(this.source,'node_modules',missingPackageName),path.join(targetPackage.source,'node_modules',missingPackageName))
    } )
  }

  protected resolvePackageModule ( packageName:string ):Observable<LocalNpmPackage> {
    return super.resolvePackageModule(packageName) as Observable<LocalNpmPackage>
  }

  protected createPackage ( source:string ):LocalNpmPackage {
    return new LocalNpmPackage(source)
  }

}
